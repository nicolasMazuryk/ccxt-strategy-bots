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
        if (!this._checkLiquidation(price)) {
            this._updatePositionPnL(price)
        }
    }

    _executeOrder(order, executionPrice, time) {
        const [_, quoteAsset] = order.pairName.split('/')
        const position = this.positions[order.pairName]
        const orderDetails = this._calculateOrderDetails(order, executionPrice, position)

        if (!this._validateMarginRequirements(order, orderDetails, quoteAsset)) return
        if (!this._validatePositionRisk(order, executionPrice)) return

        const oldPosition = { ...position }
        const realizedPnl = this._processPositionUpdate(order, position, executionPrice, oldPosition)
        
        this._updateBalanceAndFees(orderDetails.feeCost, realizedPnl, quoteAsset)
        this._logPositionUpdate(position, oldPosition, quoteAsset)
        
        this._updateOrderAfterExecution(order, time, orderDetails.cost, orderDetails.fee, quoteAsset)
        this._updatePositionPnL(executionPrice)
    }

    _calculateOrderDetails(order, executionPrice, position) {
        const cost = order.quantity * executionPrice
        const fee = order.type === 'MARKET' ? this.takerFee : this.makerFee
        const margin = cost / position.leverage
        const feeCost = cost * fee

        return { cost, fee, margin, feeCost }
    }

    _validateMarginRequirements(order, orderDetails, quoteAsset) {
        const position = this.positions[order.pairName]
        const unrealizedPnl = position.unrealizedPnl
        const availableBalance = this.balance[quoteAsset] + unrealizedPnl
        const requiredAmount = orderDetails.margin + orderDetails.feeCost

        if (availableBalance < requiredAmount) {
            order.orderStatus = 'REJECTED'
            order.error = `Insufficient margin. Required: ${requiredAmount}, Available: ${availableBalance}`
            this.onOrderUpdate(order)
            throw new Error(order.error)
            return false
        }
        return true
    }

    _processPositionUpdate(order, position, executionPrice, oldPosition) {
        let realizedPnl = 0

        if (oldPosition.positionAmt !== 0) {
            realizedPnl = this._calculateRealizedPnl(order, oldPosition, executionPrice)
        }

        this._updatePositionAmount(order, position)
        this._updateEntryPrice(position, oldPosition, order, executionPrice)

        return realizedPnl
    }

    _calculateRealizedPnl(order, oldPosition, executionPrice) {
        const closedAmount = Math.abs(order.quantity)
        const priceDiff = executionPrice - oldPosition.entryPrice
        const positionDirection = Math.sign(oldPosition.positionAmt)
        const orderDirection = order.side === 'BUY' ? 1 : -1

        if (positionDirection !== orderDirection) {
            return closedAmount * priceDiff * positionDirection
        }
        return 0
    }

    _updatePositionAmount(order, position) {
        const direction = order.side === 'BUY' ? 1 : -1
        position.positionAmt += direction * order.quantity
    }

    _updateEntryPrice(position, oldPosition, order, executionPrice) {
        if (position.positionAmt === 0) {
            position.entryPrice = 0
            position.unrealizedPnl = 0
            return
        }

        if (oldPosition.positionAmt === 0) {
            position.entryPrice = executionPrice
        } else if (
            Math.sign(oldPosition.positionAmt) === Math.sign(position.positionAmt) && 
            Math.abs(position.positionAmt) > Math.abs(oldPosition.positionAmt)
        ) {
            const oldNotional = Math.abs(oldPosition.positionAmt) * oldPosition.entryPrice
            const newNotional = order.quantity * executionPrice
            const totalQuantity = Math.abs(position.positionAmt)
            position.entryPrice = (oldNotional + newNotional) / totalQuantity
        } else if (Math.abs(position.positionAmt) > 0) {
            position.entryPrice = oldPosition.entryPrice
        }
    }

    _updateBalanceAndFees(feeCost, realizedPnl, quoteAsset) {
        if (realizedPnl) {
            this.balance[quoteAsset] += realizedPnl
            logger.info(chalk.green(
                `[PnL] Realized: ${realizedPnl} USDT`
                + `\n      New Balance: ${this.balance[quoteAsset]} USDT`
            ))
        }
        this.balance[quoteAsset] -= feeCost
    }

    _logPositionUpdate(position, oldPosition, quoteAsset) {
        logger.info(chalk.blue(
            `[Position] Update:`
            + `\n          Size: ${position.positionAmt} (was: ${oldPosition.positionAmt})`
            + `\n          Entry: ${position.entryPrice} (was: ${oldPosition.entryPrice})`
            + `\n          Balance: ${this.balance[quoteAsset]} ${quoteAsset}`
        ))
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
    _checkLiquidation(price) {
        const position = this.positions[this.pairName]
        if (position.positionAmt === 0) return false

        const [_, quoteAsset] = this.pairName.split('/')
        const maintenanceMargin = Math.abs(position.positionAmt * price * 0.004) // 0.4% maintenance margin
        const unrealizedPnl = position.positionAmt * (price - position.entryPrice)
        const walletBalance = this.balance[quoteAsset]
        const accountEquity = walletBalance + unrealizedPnl

        if (accountEquity <= maintenanceMargin) {
            this._handleLiquidation(price)
            return true
        }
        return false
    }

    _handleLiquidation(price) {
        const position = this.positions[this.pairName]
        const [_, quoteAsset] = this.pairName.split('/')
        
        logger.info(chalk.red(
            `[LIQUIDATION] Position liquidated at ${price}`
            + `\n             Size: ${position.positionAmt}`
            + `\n             Entry: ${position.entryPrice}`
        ))

        // Close position at liquidation price
        const liquidationOrder = {
            pairName: this.pairName,
            side: position.positionAmt > 0 ? 'SELL' : 'BUY',
            quantity: Math.abs(position.positionAmt),
            type: 'MARKET'
        }

        this._executeOrder(liquidationOrder, price, Date.now())
    }

    _validatePositionRisk(order, executionPrice) {
        const position = this.positions[order.pairName]
        const [_, quoteAsset] = order.pairName.split('/')
        
        // Calculate max position size based on available balance
        const availableBalance = this.balance[quoteAsset]
        const maxPositionSize = (availableBalance * position.leverage) / executionPrice
        
        // Calculate new position size after order
        const direction = order.side === 'BUY' ? 1 : -1
        const newPositionSize = Math.abs(position.positionAmt + (direction * order.quantity))
        
        if (newPositionSize > maxPositionSize) {
            order.orderStatus = 'REJECTED'
            order.error = `Position size exceeds maximum allowed. Max: ${maxPositionSize}, Attempted: ${newPositionSize}`
            this.onOrderUpdate(order)
            throw new Error(order.error)
            return false
        }
        return true
    }

}

export { FuturesExchangeEmulator }
