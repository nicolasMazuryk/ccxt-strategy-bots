import { BaseEmulator } from './base-emulator.js'
import logger from '../utils/logger.js'
import chalk from 'chalk'
import { LEVERAGE } from '../backtester/config.js'

class FuturesExchangeEmulator extends BaseEmulator {
    constructor({ initialBalance = 1000, pairName, initialPrice, takerFee, makerFee }) {
        super({ pairName, marketType: 'linear', initialPrice, takerFee, makerFee })
        
        const [_, quoteAsset] = pairName.split('/')
        this.balance = {
            [quoteAsset]: initialBalance // In futures, we only track USDT balance
        }
        
        this.positions = {
            [pairName]: {
                positionAmt: 0,
                entryPrice: 0,
                unrealizedPnl: 0,
                leverage: LEVERAGE
            }
        }
    }

    async fetchBalance() {
        const [baseAsset, quoteAsset] = this.pairName.split('/')
        return {
            info: {
                balances: [{
                    asset: quoteAsset,
                    balance: this.balance[quoteAsset],
                    crossWalletBalance: this.balance[quoteAsset]
                }],
                positions: [{
                    symbol: this.pairName,
                    positionAmt: this.positions[this.pairName].positionAmt,
                    entryPrice: this.positions[this.pairName].entryPrice,
                    unrealizedPnl: this.positions[this.pairName].unrealizedPnl,
                    leverage: this.positions[this.pairName].leverage
                }]
            }
        }
    }

    processNewPrice(price, time) {
        super.processNewPrice(price, time)
        this._updatePositionPnL(price)
    }

    _executeOrder(order, executionPrice, time) {
        const [_, quoteAsset] = order.pairName.split('/')
        const cost = order.quantity * executionPrice
        const fee = order.type === 'MARKET' ? this.takerFee : this.makerFee

        const position = this.positions[order.pairName]
        const margin = cost / position.leverage
        const feeCost = cost * fee

        // Check if we have enough margin
        if (this.balance[quoteAsset] < margin + feeCost) {
            order.orderStatus = 'REJECTED'
            order.error = `Insufficient margin. Required: ${margin + feeCost}, Available: ${this.balance[quoteAsset]}`
            
            this.onOrderUpdate(order)

            throw new Error(order.error)

            return false
        }
// ------------------------------------------------------------------------------------------------
        // Calculate potential new position size
        let newPositionAmt = position.positionAmt
        if (order.side === 'BUY') {
            newPositionAmt += order.quantity // TODO: calculation is not exact. js floating point precision issue.
        } else {
            newPositionAmt -= order.quantity // TODO: calculation is not exact. js floating point precision issue.
        }

        // Check if the new position would exceed maximum allowed leverage
        const maxPositionSize = (this.balance[quoteAsset] * position.leverage) / executionPrice // TODO: calculation do not include PnL and include already filled orders.
        if (Math.abs(newPositionAmt) > maxPositionSize) {
            order.orderStatus = 'REJECTED'
            order.error = `Position size would exceed maximum allowed leverage. Max size: ${maxPositionSize}, Attempted: ${Math.abs(newPositionAmt)}`
            
            this.onOrderUpdate(order)

            throw new Error(order.error)

            return false
        }
// ------------------------------------------------------------------------------------------------
        const oldPositionAmt = position.positionAmt
        const oldEntryPrice = position.entryPrice
        const oldUnrealizedPnl = position.unrealizedPnl

        // Calculate realized PnL for any position size change
        let realizedPnl = 0
        if (oldPositionAmt !== 0) {
            const closedAmount = Math.abs(order.quantity)
            const priceDiff = executionPrice - oldEntryPrice
            const positionDirection = Math.sign(oldPositionAmt)
            const orderDirection = order.side === 'BUY' ? 1 : -1

            // Only realize PnL if reducing position size
            if (positionDirection !== orderDirection) {
                realizedPnl = closedAmount * priceDiff * positionDirection
                this.balance[quoteAsset] += realizedPnl
                logger.info(chalk.green(
                    `[PnL] Realized: ${realizedPnl} USDT`
                    + `\n      New Balance: ${this.balance[quoteAsset]} USDT`
                ))
            }
        }

        // Update position amount
        if (order.side === 'BUY') {
            position.positionAmt += order.quantity // TODO: calculation is not exact. js floating point precision issue.
        } else {
            position.positionAmt -= order.quantity // TODO: calculation is not exact. js floating point precision issue.
        }

        // Calculate average entry price
        if (position.positionAmt !== 0) {
            if (oldPositionAmt === 0) {
                // Opening a new position
                position.entryPrice = executionPrice
            } else if (
                Math.sign(oldPositionAmt) === Math.sign(position.positionAmt) && 
                Math.abs(position.positionAmt) > Math.abs(oldPositionAmt)
            ) {
                // Adding to existing position
                const oldNotional = Math.abs(oldPositionAmt) * oldEntryPrice
                const newNotional = order.quantity * executionPrice
                const totalQuantity = Math.abs(position.positionAmt)
                position.entryPrice = (oldNotional + newNotional) / totalQuantity
            } else if (Math.abs(position.positionAmt) > 0) {
                // Reducing position but still have remaining position
                position.entryPrice = oldEntryPrice
            } else {
                // Position closed
                position.entryPrice = 0
            }
        } else {
            // Position fully closed
            position.entryPrice = 0
            position.unrealizedPnl = 0
        }

        this.balance[quoteAsset] -= feeCost
        logger.info(chalk.blue(
            `[Position] Update:`
            + `\n          Size: ${position.positionAmt} (was: ${oldPositionAmt})`
            + `\n          Entry: ${position.entryPrice} (was: ${oldEntryPrice})`
            + `\n          Balance: ${this.balance[quoteAsset]} ${quoteAsset}`
        ))

        this._updateOrderAfterExecution(order, time, cost, fee, quoteAsset)
        this._updatePositionPnL(executionPrice)
        return true
    }

    _updatePositionPnL(currentPrice) {
        const position = this.positions[this.pairName]
        if (position.positionAmt !== 0) {
            const priceDiff = currentPrice - position.entryPrice
            const oldPnL = position.unrealizedPnl
            position.unrealizedPnl = position.positionAmt * priceDiff
            
            if (Math.abs(position.unrealizedPnl - oldPnL) > 0.01) {
                logger.info(chalk.yellow(
                    `[PnL] Update: ${position.unrealizedPnl} USDT`
                    + `\n      Price: ${currentPrice}`
                ))
            }
        }
    }

    async setLeverage(leverage, pairName) {
        this.positions[pairName].leverage = leverage
    }
}

export { FuturesExchangeEmulator }
