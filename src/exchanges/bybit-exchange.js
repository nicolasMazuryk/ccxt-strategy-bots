import ccxt from 'ccxt'
import { WebsocketClient, DefaultLogger, WS_KEY_MAP } from 'bybit-api'
import logger from '../utils/logger.js'
import chalk from 'chalk'
import { BaseExchange } from './base-exchange.js'
import { retry } from '../utils/retry.js'

class BybitExchange extends BaseExchange {
    constructor({ apiKey, apiSecret, marketType }) {
        super(marketType)

        // Initialize WebSocket client
        this.wsClient = new WebsocketClient(
            {
                key: apiKey,
                secret: apiSecret,
            },
            DefaultLogger
        )

        // Initialize CCXT exchange
        const exchange = ccxt.bybit
        this.exchange = new exchange({
            apiKey: apiKey,
            secret: apiSecret,
            enableRateLimit: true,
            options: { defaultType: marketType }
        })
    }

    async setHedgeMode(symbol, isHedgeMode) {
        if (this.marketType !== 'linear') return

        // Method not supported in Portfolio Margin Mode
        return true
        // const formattedSymbol = symbol.replace('/', '')
        // await retry(async () => this.exchange.setPositionMode(isHedgeMode, formattedSymbol))
        // logger.info(chalk.green(`[Bybit ${formattedSymbol}] Hedge mode ${isHedgeMode ? 'enabled' : 'disabled'}`))
    }

    async createLimitOrder(symbol, side, quantity, price, params = {}) {
        const order = await retry(async () => this.exchange.createLimitOrder(symbol, side.toLowerCase(), quantity, price, params))
        
        logger.info(chalk.cyan(`[Bybit ${symbol}] Placed ${order.type?.toUpperCase()} order: ${side} ${chalk.yellow(quantity)} @ ${chalk.yellow(price)}`))
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
        this.wsClient.on('update', async (data) => {
            // Handle order/trade/price updates
            if (data.topic && data.data) {
                if (data.topic === 'order') {
                    const bybitOrder = data.data[0]
                    // TODO: REFACTOR THIS. Unify all exchanges interfaces.       
                    const symbol = bybitOrder.symbol
                    const side = bybitOrder.side.toUpperCase()
                    const orderType = bybitOrder.orderType.toUpperCase()
                    const originalOrderType = bybitOrder.triggerPrice ? 'STOP_MARKET' : orderType
                    const positionSide = !bybitOrder.reduceOnly ? (side === 'BUY' ? 'LONG' : 'SHORT') : (side === 'BUY' ? 'SHORT' : 'LONG')
                    const filled = parseFloat(bybitOrder.qty)
                    const averagePrice = parseFloat(bybitOrder.avgPrice)
                    const orderStatus = bybitOrder.orderStatus.toUpperCase()
                    const clientOrderId = bybitOrder.orderLinkId

                    const order = {
                        symbol: symbol,
                        side: side,
                        positionSide: positionSide,
                        orderStatus: orderStatus,
                        orderType: orderType,
                        originalOrderType: originalOrderType,
                        filled: filled,
                        originalQuantity: filled,
                        averagePrice: averagePrice,
                        orderId: bybitOrder.orderId,
                        clientOrderId: clientOrderId,
                    }

                    await this.onOrderUpdate(order)
                }
                if (data.topic.startsWith('orderbook')) {
                    const orderBook = {}
                    if (data.data.a && data.data.a.length > 0) {
                        orderBook.askPrice = parseFloat(data.data.a[0][0])
                    }
                    if (data.data.b && data.data.b.length > 0) {
                        orderBook.bidPrice = parseFloat(data.data.b[0][0])
                    }
                    
                    await this.onPriceUpdate(orderBook)
                }
            }
        })

        this.wsClient.on('authenticated', (data) => {
            logger.info(chalk.green(`[Bybit] WebSocket authenticated: ${data?.req_id}`))
        });

        this.wsClient.on('open', (data) => {
            logger.info(chalk.green(`[Bybit] WebSocket connection opened: ${data.wsKey} - $${data.event.type}`))
        })

        this.wsClient.on('reconnect', (data) => {
            logger.warn(chalk.yellow(`[Bybit] WebSocket reconnecting... Channel: ${data?.wsKey} - ${data.event.type}`))
        })

        this.wsClient.on('reconnected', (data) => {
            logger.info(chalk.green(`[Bybit] WebSocket reconnected: ${data?.wsKey} - ${data.event.type}`))
        })

        this.wsClient.on('exception', (data) => {
            logger.error(chalk.red(`[Bybit] WebSocket ERROR on channel: ${data}`))
        })
    }

    async subscribeToUserData() {
        if (this.marketType === 'spot') {
            logger.info(chalk.cyan(`[Bybit] Subscribing to ${this.marketType} user data stream...`))
            this.wsClient.subscribeV5(['order'], 'spot')
        } else {
            logger.info(chalk.cyan(`[Bybit] Subscribing to ${this.marketType} user data stream...`))
            this.wsClient.subscribeV5(['order', 'position'], 'linear')
        }
    }

    async subscribeToBookTicker(symbol) {
        const formattedSymbol = symbol.replace(':USDT', '').replace('/', '')
        if (this.marketType === 'spot') {
            logger.info(chalk.cyan(`[Bybit ${formattedSymbol}] Subscribing to spot book ticker...`))
            this.wsClient.subscribeV5([`orderbook.50.${formattedSymbol}`], 'spot')
        } else {
            logger.info(chalk.cyan(`[Bybit ${formattedSymbol}] Subscribing to linear book ticker...`))
            this.wsClient.subscribeV5([`orderbook.50.${formattedSymbol}`], 'linear')
        }
    }

    async closeAll() {
        this.wsClient.closeAll(true)
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
        // Method not supported in Portfolio Margin Mode
        return true
        // return retry(async () => this.exchange.setLeverage(leverage, symbol))
    }

    async createMarketOrder(symbol, side, quantity, params = {}) {
        return retry(async () => this.exchange.createMarketOrder(symbol, side.toLowerCase(), quantity, undefined, params))
    }

    async createMarketBuyOrder(symbol, amount, params = {}) {
        return retry(async () => this.exchange.createMarketBuyOrder(symbol, amount, params))
    }

    async createMarketSellOrder(symbol, amount, params = {}) {
        return retry(async () => this.exchange.createMarketSellOrder(symbol, amount, params))
    }

    async createStopLossOrder(symbol, side, amount, stopLossPrice, params = {}) {
        try {
            const order = await retry(async () => this.exchange.createOrder(
                symbol,
                'market',
                side.toLowerCase(),
                amount,
                undefined,
                { ...params, triggerPrice: stopLossPrice, triggerBy: 'LastPrice' }
            ))
            logger.info(chalk.cyan(`[Bybit ${symbol}] Placed Stop-Loss order: ${order.type?.toUpperCase()} ${side} ${chalk.yellow(amount)} @ ${chalk.yellow(order.triggerPrice)}`))
            return order
        } catch (error) {
            const immidiatellyTriggeredMarketOrder = await this.handleStopMarketOrderWouldTriggerImmediatelyError(error, symbol, side, amount, params, 'Stop-Loss')

            if (immidiatellyTriggeredMarketOrder) return immidiatellyTriggeredMarketOrder

            logger.error(chalk.red(`[Bybit ${symbol}] Failed to place Stop-Loss order: ${error.message}`))
            throw error
        }
    }

    async createTakeProfitOrder(symbol, side, amount, takeProfitPrice, params = {}) {
        try {
            const order = await retry(async () => this.exchange.createOrder(
                symbol,
                'market',
                side.toLowerCase(),
                amount,
                undefined,
                { ...params, triggerPrice: takeProfitPrice, triggerBy: 'LastPrice' }
            ))
            logger.info(chalk.cyan(`[Bybit ${symbol}] Placed Take-Profit order: ${order.type?.toUpperCase()} ${side} ${chalk.yellow(amount)} @ ${chalk.yellow(order.triggerPrice)}`))
            return order
        } catch (error) {
            const immidiatellyTriggeredMarketOrder = await this.handleStopMarketOrderWouldTriggerImmediatelyError(error, symbol, side, amount, params, 'Take-Profit')

            if (immidiatellyTriggeredMarketOrder) return immidiatellyTriggeredMarketOrder

            logger.error(chalk.red(`[Bybit ${symbol}] Failed to place Take-Profit order: ${error.message}`))
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
                { ...params, triggerPrice: stopPrice, triggerBy: 'LastPrice' }
            ))
            logger.info(chalk.cyan(`[Bybit ${symbol}] Placed Stop-Market order: ${order.type?.toUpperCase()} ${side} ${chalk.yellow(amount)} @ ${chalk.yellow(order.triggerPrice)}`))
            return order
        } catch (error) {
            const immidiatellyTriggeredMarketOrder = await this.handleStopMarketOrderWouldTriggerImmediatelyError(error, symbol, side, amount, params, 'Stop-Market')

            if (immidiatellyTriggeredMarketOrder) return immidiatellyTriggeredMarketOrder

            logger.error(chalk.red(`[Bybit ${symbol}] Failed to place Stop-Market order: ${error.message}`))
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
        const orderWouldTriggerImmediatelyErrorCodes = [110092, 110093]

        // fallback to market order if stop order can not be executed
        if (orderWouldTriggerImmediatelyErrorCodes.some(code => error.message.includes(code.toString()))) {
            delete params.triggerPrice
            delete params.stopLossPrice
            delete params.takeProfitPrice

            logger.warn(chalk.yellow(`[Bybit ${symbol}] Failed to place ${orderType?.toUpperCase()} order - Stop price would trigger immediately. Placing simple MARKET order instead...`))
            logger.warn(chalk.yellow(`[Bybit ${symbol}] MARKET order params: side=${side}, amount=${amount}, params=${JSON.stringify(params)}`))
            
            const order = await retry(async () => this.exchange.createOrder(
                symbol,
                'market',
                side.toLowerCase(), 
                amount,
                undefined,
                params
            ))
            logger.info(chalk.cyan(`[Bybit ${symbol}] Placed MARKET order: ${order.type?.toUpperCase()} ${side} ${chalk.yellow(amount)}`))
            return order
        }

        return false
    }

    async fetchFundingRate(symbol) {
        const fundingRates = await retry(async () => this.exchange.fetchFundingRates([symbol]))
        return fundingRates[symbol]
    }
}

export { BybitExchange }