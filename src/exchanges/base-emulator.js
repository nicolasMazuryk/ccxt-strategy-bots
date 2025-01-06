import { BaseExchange } from './base-exchange.js'
import logger from '../utils/logger.js'
import chalk from 'chalk'

class BaseEmulator extends BaseExchange {
    constructor({ marketType, takerFee, makerFee, initialPrices }) {
        super(marketType)
        this.currentPrices = { ...initialPrices } || {}
        this.currentTime = null
        this.orders = new Map()
        this.lastOrderId = 0
        this.takerFee = takerFee
        this.makerFee = makerFee
    }

    fetchOrderBook(pairName) {
        const price = this.currentPrices[pairName] || 0
        return {
            asks: [[price, 1]],
            bids: [[price, 1]]
        }
    }

    createLimitBuyOrder(pairName, quantity, price) {
        const orderId = ++this.lastOrderId
        const order = {
            id: orderId,
            side: 'BUY',
            price,
            orderStatus: 'NEW',
            quantity,
            pairName,
            type: 'LIMIT',
            time: this.currentTime
        }
        this.orders.set(orderId, order)
        logger.info(chalk.cyan(`Place BUY order: ${quantity} @ ${price} for ${pairName}`))
        return order
    }

    createLimitSellOrder(pairName, quantity, price) {
        const orderId = ++this.lastOrderId
        const order = {
            id: orderId,
            side: 'SELL',
            price,
            orderStatus: 'NEW',
            quantity,
            pairName,
            type: 'LIMIT',
            time: this.currentTime
        }
        this.orders.set(orderId, order)
        logger.info(chalk.cyan(`Place SELL order: ${quantity} @ ${price} for ${pairName}`))
        return order
    }

    createMarketBuyOrder(pairName, quantity) {
        const orderId = ++this.lastOrderId
        const executionPrice = this.currentPrices[pairName]
        
        const order = {
            id: orderId,
            side: 'BUY',
            price: executionPrice,
            orderStatus: 'NEW',
            quantity,
            pairName,
            type: 'MARKET',
            time: this.currentTime
        }
        
        this.orders.set(orderId, order)
        this._executeOrder(order, executionPrice, this.currentTime)
        
        return order
    }

    createMarketSellOrder(pairName, quantity) {
        const orderId = ++this.lastOrderId
        const executionPrice = this.currentPrices[pairName]
        
        const order = {
            id: orderId,
            side: 'SELL',
            price: executionPrice,
            orderStatus: 'NEW',
            quantity,
            pairName,
            type: 'MARKET',
            time: this.currentTime
        }
        
        this.orders.set(orderId, order)
        this._executeOrder(order, executionPrice, this.currentTime)
        
        return order
    }

    processNewPrice(pairName, price, time) {
        this.currentPrices[pairName] = price
        this.currentTime = time

        this._matchOrders(pairName, price, time)

        this.onPriceUpdate({
            eventType: 'bookTicker',
            pairName: pairName,
            askPrice: price,
            bidPrice: price,
            time: time
        })
    }

    _matchOrders(pairName, price, time) {
        for (const [orderId, order] of this.orders.entries()) {
            if (order.orderStatus !== 'NEW' || order.pairName !== pairName) continue

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

    initializeWebSocket() {
        logger.info(chalk.cyan('Initialized emulated WebSocket connection'))
    }

    subscribeToUserData() {
        logger.info(chalk.cyan('Subscribed to emulated user data stream'))
    }

    subscribeToBookTicker(pairName) {
        logger.info(chalk.cyan(`Subscribed to emulated book ticker for ${pairName}`))
    }

    closeAll() {
        logger.info(chalk.cyan('Closing emulated websocket connection'))
    }

    cancelAllOrders(pairName) {
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

    fetchBalance() {
        throw new Error('Method fetchBalance must be implemented')
    }
}

export { BaseEmulator } 