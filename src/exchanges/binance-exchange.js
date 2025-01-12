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

class BinanceExchange extends BaseExchange {
    constructor({ apiKey, apiSecret, marketType }) {
        super(marketType)
        // this.marketType = marketType
        // this.orderUpdateCallback = null
        // this.priceUpdateCallback = null

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

        this.exchange.options['maxRetriesOnFailure'] = 300
        this.exchange.options['maxRetriesOnFailureDelay'] = 2000
    }

    // onOrderUpdate(callback) {
    //     this.orderUpdateCallback = callback
    // }

    // onPriceUpdate(callback) {
    //     this.priceUpdateCallback = callback
    // }

    async createLimitBuyOrder(symbol, quantity, price) {
        return this.exchange.createLimitBuyOrder(symbol, quantity, price)
    }

    async createLimitSellOrder(symbol, quantity, price) {
        return this.exchange.createLimitSellOrder(symbol, quantity, price)
    }

    async fetchOrderBook(symbol) {
        return this.exchange.fetchOrderBook(symbol)
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
            logger.info(chalk.green(`WebSocket connection opened: ${data.wsKey} - ${data.ws.target.url}`))
        })
        
        this.wsClient.on('reconnecting', (data) => {
            logger.warn(chalk.yellow(`WebSocket reconnecting... Channel: ${data?.wsKey}`))
        })
        
        this.wsClient.on('reconnected', (data) => {
            if (typeof data?.wsKey === 'string' && data.wsKey.toLowerCase().includes('userdata')) {
                logger.info(chalk.green('ws for user data stream has reconnected ', data?.wsKey))
            } else {
                logger.info(chalk.green(`WebSocket reconnected: ${data?.wsKey}`))
            }
        })
        
        this.wsClient.on('error', (data) => {
            logger.error(chalk.red(`WebSocket ERROR on channel ${data?.wsKey}`))
        })
    }

    async subscribeToUserData() {
        if (this.marketType === 'spot') {
            logger.info(chalk.cyan('Subscribing to spot user data stream...'))
            await this.wsClient.subscribeSpotUserDataStream()
        }
        if (this.marketType === 'linear') {
            logger.info(chalk.cyan('Subscribing to USDM futures user data stream...'))
            await this.wsClient.subscribeUsdFuturesUserDataStream()
        }
    }

    async subscribeToBookTicker(symbol) {
        const formattedSymbol = symbol.replace('/', '')
        if (this.marketType === 'spot') {
            logger.info(chalk.cyan('Subscribing to spot book ticker...'))
            await this.wsClient.subscribeSymbolBookTicker(formattedSymbol, 'spot')
        }
        if (this.marketType === 'linear') {
            logger.info(chalk.cyan('Subscribing to futures book ticker...'))
            await this.wsClient.subscribeSymbolBookTicker(formattedSymbol, 'usdm')
        }
    }

    async closeAll() {
        this.wsClient.closeAll()
    }

    async cancelAllOrders(symbol) {
        return this.exchange.cancelAllOrders(symbol)
    }

    async fetchBalance() {
        return this.exchange.fetchBalance()
    }

    async createMarketSellOrder(symbol, amount) {
        return this.exchange.createMarketSellOrder(symbol, amount)
    }

    async cancelOrdersBelowPrice(symbol, price) {
        const openOrders = await this.exchange.fetchOpenOrders(symbol)

        const ordersToCancel = openOrders.filter(order => parseFloat(order.price) <= price)

        const canceledOrders = await Promise.all(ordersToCancel.map(order => this.exchange.cancelOrder(order.id, symbol)))

        return canceledOrders
    }
}

export { BinanceExchange }