import ccxt from 'ccxt'
import {
    WebsocketClient,
    DefaultLogger,
    isWsFormattedSpotUserDataExecutionReport,
    isWsFormattedFuturesUserDataTradeUpdateEvent,
} from 'binance'
import logger from '../utils/logger.js'
import chalk from 'chalk'
import { BaseExchange } from './base-exchange.js'
import { retry } from '../utils/retry.js'

class BinanceExchange extends BaseExchange {
    constructor({ apiKey, apiSecret, marketType }) {
        super(marketType)

        // Initialize WebSocket client
        this.wsClient = new WebsocketClient(
            {
                api_key: apiKey,
                api_secret: apiSecret,
                beautify: true,
                logger: DefaultLogger
            },
        )

        // Initialize CCXT exchange
        const exchange = this.marketType === 'spot' ? ccxt.binance : ccxt.binanceusdm
        this.exchange = new exchange({
            apiKey: apiKey,
            secret: apiSecret,
        })
    }

    async setHedgeMode(symbol, isHedgeMode) {
        if (this.marketType !== 'linear') return
        
        const formattedSymbol = symbol.replace('/', '')
        await retry(async () => this.exchange.setPositionMode(isHedgeMode, formattedSymbol))
        logger.info(chalk.green(`[Exchange ${formattedSymbol}] Hedge mode ${isHedgeMode ? 'enabled' : 'disabled'}`))
    }

    async createLimitOrder(symbol, side, quantity, price, params = {}) {
        const order = await retry(async () => this.exchange.createLimitOrder(symbol, side, quantity, price, params))
        
        logger.info(chalk.cyan(`[Exchange ${symbol}] Placed ${order.type.toUpperCase()} order: ${side} ${chalk.yellow(quantity)} @ ${chalk.yellow(price)}`))
        return order
    }

    async createLimitBuyOrder(symbol, quantity, price, params = {}) {
        return retry(async () => this.exchange.createLimitBuyOrder(symbol, quantity, price, params))
    }

    async createLimitSellOrder(symbol, quantity, price, params = {}) {
        return retry(async () => this.exchange.createLimitSellOrder(symbol, quantity, price, params))
    }

    async fetchOrderBook(symbol) {
        return retry(async () => this.exchange.fetchOrderBook(symbol))
    }

    async initializeWebSocket() {
        this.wsClient.on('formattedMessage', async (data) => {
            if (this.marketType === 'spot') {
                if (isWsFormattedSpotUserDataExecutionReport(data)) {
                    await this.onOrderUpdate(data)
                }
            }

            if (this.marketType === 'linear') {
                if (isWsFormattedFuturesUserDataTradeUpdateEvent(data)) {
                    await this.onOrderUpdate(data.order)
                }
            }

            if (data.eventType === 'bookTicker') {
                await this.onPriceUpdate(data)
            }
        })
        
        this.wsClient.on('open', (data) => {
            logger.info(chalk.green(`[Exchange] WebSocket connection opened: ${data.wsKey} - ${data.ws.target.url}`))
        })
        
        this.wsClient.on('reconnecting', (data) => {
            logger.warn(chalk.yellow(`[Exchange] WebSocket reconnecting... Channel: ${data?.wsKey}`))
        })
        
        this.wsClient.on('reconnected', (data) => {
            if (typeof data?.wsKey === 'string' && data.wsKey.toLowerCase().includes('userdata')) {
                logger.info(chalk.green(`[Exchange] ws for user data stream has reconnected: ${data?.wsKey}`))
            } else {
                logger.info(chalk.green(`[Exchange] WebSocket reconnected: ${data?.wsKey}`))
            }
        })
        
        this.wsClient.on('error', (data) => {
            logger.error(chalk.red(`[Exchange] WebSocket ERROR on channel ${data?.wsKey}`))
        })
    }

    async subscribeToUserData() {
        if (this.marketType === 'spot') {
            logger.info(chalk.cyan(`[Exchange] Subscribing to spot user data stream...`))
            await this.wsClient.subscribeSpotUserDataStream()
        }
        if (this.marketType === 'linear') {
            logger.info(chalk.cyan(`[Exchange] Subscribing to USDM futures user data stream...`))
            await this.wsClient.subscribeUsdFuturesUserDataStream()
        }
    }

    async subscribeToBookTicker(symbol) {
        const formattedSymbol = symbol.replace('/', '')
        if (this.marketType === 'spot') {
            logger.info(chalk.cyan(`[Exchange ${formattedSymbol}] Subscribing to spot book ticker...`))
            await this.wsClient.subscribeSymbolBookTicker(formattedSymbol, 'spot')
        }
        if (this.marketType === 'linear') {
            logger.info(chalk.cyan(`[Exchange ${formattedSymbol}] Subscribing to futures book ticker...`))
            await this.wsClient.subscribeSymbolBookTicker(formattedSymbol, 'usdm')
        }
    }

    async closeAll() {
        this.wsClient.closeAll()
    }

    async cancelOrders(symbol, ids) {
        return retry(async () => this.exchange.cancelOrders(ids, symbol))
    }

    async cancelAllOrders(symbol) {
        return retry(async () => this.exchange.cancelAllOrders(symbol))
    }

    async fetchBalance() {
        return retry(async () => this.exchange.fetchBalance())
    }

    async setLeverage(symbol, leverage) {
        return retry(async () => this.exchange.setLeverage(leverage, symbol))
    }

    async createMarketOrder(symbol, side, quantity, params = {}) {
        return retry(async () => this.exchange.createMarketOrder(symbol, side, quantity, undefined, params))
    }

    async createMarketBuyOrder(symbol, amount, params = {}) {
        return retry(async () => this.exchange.createMarketBuyOrder(symbol, amount, params))
    }

    async createMarketSellOrder(symbol, amount, params = {}) {
        return retry(async () => this.exchange.createMarketSellOrder(symbol, amount, params))
    }

    async createStopLossOrder(symbol, side, amount, stopLossPrice, params = {}) {
        try {
            const order = await retry(async () => this.exchange.createStopLossOrder(
                symbol,
                'market',
                side.toLowerCase(),
                amount,
                undefined,
                stopLossPrice,
                params
            ))
            logger.info(chalk.cyan(`[Exchange ${symbol}] Placed Stop-Loss order: ${order.type.toUpperCase()} ${side} ${chalk.yellow(amount)} @ ${chalk.yellow(order.stopPrice)}`))
            return order
        } catch (error) {
            const immidiatellyTriggeredMarketOrder = await this.handleStopMarketOrderWouldTriggerImmediatelyError(error, symbol, side, amount, params, 'Stop-Loss')

            if (immidiatellyTriggeredMarketOrder) return immidiatellyTriggeredMarketOrder

            logger.error(chalk.red(`[Exchange ${symbol}] Failed to place Stop-Loss order: ${error.message}`))
            throw error
        }
    }

    async createTakeProfitOrder(symbol, side, amount, takeProfitPrice, params = {}) {
        try {
            const order = await retry(async () => this.exchange.createTakeProfitOrder(
                symbol,
                'market',
                side.toLowerCase(),
                amount,
                undefined,
                takeProfitPrice,
                params
            ))
            logger.info(chalk.cyan(`[Exchange ${symbol}] Placed Take-Profit order: ${order.type.toUpperCase()} ${side} ${chalk.yellow(amount)} @ ${chalk.yellow(order.stopPrice)}`))
            return order
        } catch (error) {
            const immidiatellyTriggeredMarketOrder = await this.handleStopMarketOrderWouldTriggerImmediatelyError(error, symbol, side, amount, params, 'Take-Profit')

            if (immidiatellyTriggeredMarketOrder) return immidiatellyTriggeredMarketOrder

            logger.error(chalk.red(`[Exchange ${symbol}] Failed to place Take-Profit order: ${error.message}`))
            throw error
        }
    }

    async createStopMarketOrder(symbol, side, amount, stopPrice, params = {}) {
        try {
            const order = await retry(async () => this.exchange.createOrder(
                symbol,
                'market',
                side.toLowerCase(),
                amount,
                undefined,
                { ...params, triggerPrice: stopPrice }
            ))
            logger.info(chalk.cyan(`[Exchange ${symbol}] Placed Stop-Market order: ${order.type.toUpperCase()} ${side} ${chalk.yellow(amount)} @ ${chalk.yellow(order.stopPrice)}`))
            return order
        } catch (error) {
            const immidiatellyTriggeredMarketOrder = await this.handleStopMarketOrderWouldTriggerImmediatelyError(error, symbol, side, amount, params, 'Stop-Market')

            if (immidiatellyTriggeredMarketOrder) return immidiatellyTriggeredMarketOrder

            logger.error(chalk.red(`[Exchange ${symbol}] Failed to place Stop-Market order: ${error.message}`))
            throw error
        }
    }

    async cancelOrdersBelowPrice(symbol, price) {
        const openOrders = await retry(async () => this.exchange.fetchOpenOrders(symbol))

        const ordersToCancel = openOrders.filter(order => parseFloat(order.price) <= price)

        const canceledOrders = await Promise.all(
            ordersToCancel.map(order => 
                retry(async () => this.exchange.cancelOrder(order.id, symbol))
            )
        )

        return canceledOrders
    }

    async handleStopMarketOrderWouldTriggerImmediatelyError(error, symbol, side, amount, params, orderType) {
        const orderWouldTriggerImmediatelyErrorMessage = "binanceusdm {\"code\":-2021,\"msg\":\"Order would immediately trigger.\"}"

        // fallback to market order if stop order can not be executed
        if (error.message === orderWouldTriggerImmediatelyErrorMessage) {
            delete params.triggerPrice
            delete params.stopLossPrice
            delete params.takeProfitPrice

            logger.warn(chalk.yellow(`[Exchange ${symbol}] Failed to place ${orderType.toUpperCase()} order - Stop price would trigger immediately. Placing simple MARKET order instead...`))
            logger.warn(chalk.yellow(`[Exchange ${symbol}] MARKET order params: side=${side}, amount=${amount}, params=${JSON.stringify(params)}`))
            
            const order = await retry(async () => this.exchange.createOrder(
                symbol,
                'market',
                side.toLowerCase(), 
                amount,
                undefined,
                params
            ))
            logger.info(chalk.cyan(`[Exchange ${symbol}] Placed MARKET order: ${order.type.toUpperCase()} ${side} ${chalk.yellow(amount)}`))
            return order
        }

        return false
    }

    async fetchFundingRate(symbol) {
        return retry(async () => this.exchange.fetchFundingRate(symbol))
    }
}

export { BinanceExchange }