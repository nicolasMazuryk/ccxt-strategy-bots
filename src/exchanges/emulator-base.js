import { BaseExchange } from './base-exchange.js'
import logger from '../utils/logger.js'
import chalk from 'chalk'

class BaseEmulator extends BaseExchange {
    constructor({ marketType, takerFee, makerFee, initialPrices }) {
        super(marketType)
        this.currentPrices = { ...initialPrices } || {}
        this.currentTime = null
        this.lastOrderId = 0
        this.orders = []
        this.trades = []
        this.closedTrades = []
        this.openTrades = {
            long: {},  // BUY trades for LONG positions
            short: {}, // SELL trades for SHORT positions
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
        // Flatten all open trades from both long and short positions
        const allOpenTrades = [
            ...Object.values(this.openTrades.long).flat(),
            ...Object.values(this.openTrades.short).flat()
        ].sort((a, b) => b.entryTimestamp - a.entryTimestamp)

        return {
            closedTrades: this.closedTrades,
            openTrades: allOpenTrades
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
        this.orders.push(order)
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
        this.orders.push(order)
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
        
        this.orders.push(order)
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
        
        this.orders.push(order)
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
        this.orders
            .filter(order => order.orderStatus === 'NEW' && order.pairName === pairName)
            .forEach(order => {
                if (order.side === 'BUY' && price < order.price) {
                    this._executeOrder(order, order.price, time)
                } else if (order.side === 'SELL' && price > order.price) {
                    this._executeOrder(order, order.price, time)
                }
            })
    }

    _updateOrderAfterExecution(order, time, cost, fee, quoteAsset, realizedPnL = 0) {
        order.orderStatus = 'FILLED'
        order.executionTime = time
        order.cost = cost
        order.commission = cost * fee
        order.commissionAsset = quoteAsset

        const trade = { ...order, realizedPnL }

        this.trades.push(trade)
        this._matchNewTrade(trade)

        this.onOrderUpdate(order)
    }

    _matchNewTrade(trade) {
        // Initialize arrays for this pair if they don't exist
        if (!this.openTrades.long[trade.pairName]) {
            this.openTrades.long[trade.pairName] = []
        }
        if (!this.openTrades.short[trade.pairName]) {
            this.openTrades.short[trade.pairName] = []
        }

        if (trade.side === 'BUY') {
            const openShorts = this.openTrades.short[trade.pairName]
            
            if (openShorts.length > 0) {
                // Close SHORT position (LIFO)
                const openTrade = openShorts.pop()

                this.closedTrades.push(Object.assign(openTrade, {
                    status: 'CLOSED',
                    
                    exitTrade: trade,
                    exitPrice: trade.price,
                    exitTimestamp: trade.executionTime,
                    
                    realizedPnL: openTrade.realizedPnL + trade.realizedPnL,
                    commission: openTrade.commission + trade.commission,
                    dust: openTrade.entryTrade.quantity - trade.quantity,
                }))
            } else {
                // Open LONG position
                const openTrade = {
                    pairName: trade.pairName,
                    positionType: 'LONG', 
                    status: 'OPEN',
                    
                    entryTrade: trade,
                    entryPrice: trade.price,
                    entryTimestamp: trade.executionTime,
                    
                    realizedPnL: trade.realizedPnL,
                    commission: trade.commission,
                    dust: 0
                }
                this.openTrades.long[trade.pairName].push(openTrade)
            }
        } else if (trade.side === 'SELL') {
            const openLongs = this.openTrades.long[trade.pairName]
            
            if (openLongs.length > 0) {
                // Close LONG position (LIFO)
                const openTrade = openLongs.pop()

                this.closedTrades.push(Object.assign(openTrade, {
                    status: 'CLOSED',
                    
                    exitTrade: trade,
                    exitPrice: trade.price,
                    exitTimestamp: trade.executionTime,
                    
                    realizedPnL: openTrade.realizedPnL + trade.realizedPnL,
                    commission: openTrade.commission + trade.commission,
                    dust: openTrade.entryTrade.quantity - trade.quantity,
                }))
            } else {
                // Open SHORT position
                const openTrade = {
                    pairName: trade.pairName,
                    positionType: 'SHORT',
                    status: 'OPEN',
                    
                    entryTrade: trade,
                    entryPrice: trade.price,
                    entryTimestamp: trade.executionTime,
                    
                    realizedPnL: trade.realizedPnL,
                    commission: trade.commission,
                    dust: 0
                }
                this.openTrades.short[trade.pairName].push(openTrade)
            }
        }
    }

    cancelOrdersBelowPrice(pairName, price) {
        const canceledOrders = this.orders.filter(order => 
            order.pairName === pairName && 
            order.orderStatus === 'NEW' &&
            order.price <= price
        )
        
        this.orders = this.orders.filter(order => 
            order.pairName !== pairName || 
            order.orderStatus !== 'NEW' ||
            order.price > price
        )
        
        return canceledOrders
    }

    cancelAllOrders(pairName) {
        // Find orders to cancel
        const canceledOrders = this.orders.filter(order => 
            order.pairName === pairName && order.orderStatus === 'NEW'
        )
        
        // Update remaining orders
        this.orders = this.orders.filter(order => 
            order.pairName !== pairName || order.orderStatus !== 'NEW'
        )
        
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
