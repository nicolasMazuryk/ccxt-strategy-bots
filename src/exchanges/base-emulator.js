import { BaseExchange } from './base-exchange.js'
import logger from '../utils/logger.js'
import chalk from 'chalk'

class BaseEmulator extends BaseExchange {
    constructor({ pairName, marketType, initialPrice, takerFee, makerFee }) {
        super(marketType)
        this.pairName = pairName
        this.currentPrice = initialPrice
        this.orders = new Map()
        this.lastOrderId = 0
        // this.orderUpdateCallback = null
        // this.priceUpdateCallback = null
        this.takerFee = takerFee
        this.makerFee = makerFee
    }

    async fetchOrderBook() {
        return {
            asks: [[this.currentPrice, 1]],
            bids: [[this.currentPrice, 1]]
        }
    }

    async createLimitBuyOrder(pairName, quantity, price) {
        const orderId = ++this.lastOrderId
        const order = {
            id: orderId,
            side: 'BUY',
            price,
            orderStatus: 'NEW',
            quantity,
            pairName,
            type: 'LIMIT',
        }
        this.orders.set(orderId, order)
        logger.info(chalk.cyan(`Place BUY order: ${quantity} @ ${price}`))
        return order
    }

    async createLimitSellOrder(pairName, quantity, price) {
        const orderId = ++this.lastOrderId
        const order = {
            id: orderId,
            side: 'SELL',
            price,
            orderStatus: 'NEW',
            quantity,
            pairName,
            type: 'LIMIT',
        }
        this.orders.set(orderId, order)
        logger.info(chalk.cyan(`Place SELL order: ${quantity} @ ${price}`))
        return order
    }

    async createMarketBuyOrder(pairName, quantity) {
        const orderId = ++this.lastOrderId
        const executionPrice = this.currentPrice
        
        const order = {
            id: orderId,
            side: 'BUY',
            price: executionPrice,
            orderStatus: 'NEW',
            quantity,
            pairName,
            type: 'MARKET', 
        }
        
        this.orders.set(orderId, order)
        this._executeOrder(order, executionPrice, Date.now())
        
        return order
    }

    async createMarketSellOrder(pairName, quantity) {
        const orderId = ++this.lastOrderId
        const executionPrice = this.currentPrice
        
        const order = {
            id: orderId,
            side: 'SELL',
            price: executionPrice,
            orderStatus: 'NEW',
            quantity,
            pairName,
            type: 'MARKET',
        }
        
        this.orders.set(orderId, order)
        this._executeOrder(order, executionPrice, Date.now())
        
        return order
    }

    processNewPrice(price, time) {
        this.currentPrice = price

        this._matchOrders(price, time)

        this.onPriceUpdate({
            eventType: 'bookTicker',
            pairName: this.pairName,
            askPrice: price,
            bidPrice: price
        })
    }

    _matchOrders(price, time) {
        for (const [orderId, order] of this.orders.entries()) {
            if (order.orderStatus !== 'NEW') continue

            if (order.side === 'BUY' && price < order.price) {
                this._executeOrder(order, order.price, time)
            } else if (order.side === 'SELL' && price > order.price) {
                this._executeOrder(order, order.price, time)
            }
        }
    }

    _updateOrderAfterExecution(order, time, cost, fee, quoteAsset) {
        order.orderStatus = 'FILLED'
        order.executionTime = time
        order.cost = cost
        order.commission = cost * fee
        order.commissionAsset = quoteAsset

        this.onOrderUpdate(order)
    }

    // onOrderUpdate(callback) {
    //     this.orderUpdateCallback = callback
    // }

    // onPriceUpdate(callback) {
    //     this.priceUpdateCallback = callback
    // }

    async initializeWebSocket() {
        logger.info(chalk.cyan('Initialized emulated WebSocket connection'))
    }

    async subscribeToUserData() {
        logger.info(chalk.cyan('Subscribed to emulated user data stream'))
    }

    async subscribeToBookTicker(pairName) {
        logger.info(chalk.cyan(`Subscribed to emulated book ticker for ${pairName}`))
    }

    async closeAll() {
        logger.info(chalk.cyan('Closing emulated websocket connection'))
    }

    async cancelAllOrders(pairName) {
        const canceledOrders = Array.from(this.orders.values()).filter(order => 
            order.pairName === pairName && order.orderStatus === 'NEW'
        )
        this.orders = new Map([...this.orders].filter(([_, order]) => 
            order.pairName !== pairName || order.orderStatus !== 'NEW'
        ))
        return canceledOrders
    }

    // Abstract methods that must be implemented by spot/futures classes
    _executeOrder(order, executionPrice, time) {
        throw new Error('Method _executeOrder must be implemented')
    }

    async fetchBalance() {
        throw new Error('Method fetchBalance must be implemented')
    }
}

export { BaseEmulator } 