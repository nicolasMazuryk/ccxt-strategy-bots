import { BaseExchange } from './base-exchange.js'
import logger from '../utils/logger.js'
import chalk from 'chalk'

class BaseEmulator extends BaseExchange {
    constructor({ marketType, takerFee, makerFee, initialPrices }) {
        super(marketType)
        this.currentPrices = { ...initialPrices } || {}
        this.currentTime = null
        this.lastOrderId = 0
        this.orders = new Map()
        this.trades = []
        this.closedTrades = []
        this.openTrades = {
            longEntries: [],  // BUY trades for LONG positions
            shortEntries: [], // SELL trades for SHORT positions
        }
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

    fetchTrades() {
        return [...this.trades]
    }

    getClosedAndOpenTrades() {
        return {
            closedTrades: this.closedTrades,
            openTrades: [...this.openTrades.longEntries, ...this.openTrades.shortEntries].sort((a, b) => b.executionTime - a.executionTime)
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

    processNewPrice(pairName, price, timestamp) {
        this.currentPrices[pairName] = price
        this.currentTime = timestamp

        this._matchOrders(pairName, price, timestamp)

        this.onPriceUpdate({
            eventType: 'bookTicker',
            pairName: pairName,
            askPrice: price,
            bidPrice: price,
            timestamp
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

    _updateOrderAfterExecution(order, time, cost, fee, quoteAsset, realizedPnL = 0) {
        order.orderStatus = 'FILLED'
        order.executionTime = time
        order.cost = cost
        order.commission = cost * fee
        order.commissionAsset = quoteAsset
        order.realizedPnL = realizedPnL

        this.trades.push({ ...order })
        this._matchNewTrade(order)

        this.onOrderUpdate(order)
    }

    _matchNewTrade(trade) {
        if (trade.side === 'BUY') {
            if (this.openTrades.shortEntries.length > 0) {
                // Close SHORT position (LIFO)
                const matchingShort = this.openTrades.shortEntries.pop()
                this.closedTrades.push({
                    entryTrade: matchingShort,
                    exitTrade: trade,
                    entryTimestamp: matchingShort.executionTime,
                    exitTimestamp: trade.executionTime,
                    entryPrice: matchingShort.price,
                    exitPrice: trade.price,
                    realizedPnL: matchingShort.realizedPnL + trade.realizedPnL,
                    commission: (matchingShort.commission || 0) + (trade.commission || 0),
                    positionType: 'SHORT',
                    status: 'CLOSED'
                })
            } else {
                // Open LONG position
                const openTrade = {
                    ...trade,
                    entryTimestamp: trade.executionTime,
                    exitTimestamp: '',
                    positionType: 'LONG',
                    entryPrice: trade.price,
                    exitPrice: '',
                    status: 'OPEN'
                }
                this.openTrades.longEntries.push(openTrade)
            }
        } else if (trade.side === 'SELL') {
            if (this.openTrades.longEntries.length > 0) {
                // Close LONG position (LIFO)
                const matchingLong = this.openTrades.longEntries.pop()
                this.closedTrades.push({
                    entryTrade: matchingLong,
                    exitTrade: trade,
                    entryTimestamp: matchingLong.executionTime,
                    exitTimestamp: trade.executionTime,
                    entryPrice: matchingLong.price,
                    exitPrice: trade.price,
                    realizedPnL: matchingLong.realizedPnL + trade.realizedPnL,
                    commission: (matchingLong.commission || 0) + (trade.commission || 0),
                    positionType: 'LONG',
                    status: 'CLOSED'
                })
            } else {
                // Open SHORT position
                const openTrade = {
                    ...trade,
                    entryTimestamp: trade.executionTime,
                    exitTimestamp: '',
                    positionType: 'SHORT',
                    entryPrice: trade.price,
                    exitPrice: '',
                    status: 'OPEN'
                }
                this.openTrades.shortEntries.push(openTrade)
            }
        }
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

    // Abstract methods that must be implemented by spot/futures classes
    _executeOrder(order, executionPrice, time) {
        throw new Error('Method _executeOrder must be implemented')
    }

    fetchBalance() {
        throw new Error('Method fetchBalance must be implemented')
    }
}

export { BaseEmulator } 
