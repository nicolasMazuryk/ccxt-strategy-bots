import { BaseEmulator } from './base-emulator.js'
import logger from '../utils/logger.js'
import chalk from 'chalk'
import { LEVERAGE } from '../backtester/config.js'
import { getMaintenanceRate } from '../utils/maintenance-tier.js'

class FuturesExchangeEmulator extends BaseEmulator {
    constructor({ initialBalances, initialPrices, takerFee, makerFee }) {
        super({ marketType: 'linear', initialPrices, takerFee, makerFee })
    
        // Wallet parameters
        this.wallet = {
            balance: initialBalances.USDT,
            unrealizedPnL: 0,
            marginBalance: initialBalances.USDT,
            availableBalance: initialBalances.USDT,
            accountMarginRatio: 0,
            accountMaintenanceMargin: 0,
            accountEquity: initialBalances.USDT,
            positionValue: 0,
            actualLeverage: 0,

            cummulativeFees: 0,
            cummulativeFunding: 0,
        }
        
        // Position parameters
        this.positions = {}
    }

    async fetchBalance() {
        return {
            info: {
                balances: [{
                    asset: 'USDT',
                    balance: this.wallet.balance,
                    crossWalletBalance: this.wallet.balance
                }],
                positions: Object.entries(this.positions).map(([pairName, position]) => ({
                    symbol: pairName,
                    ...position
                })),
                wallet: this.wallet
            }
        }
    }

    processNewPrice(pairName, price, time) {
        super.processNewPrice(pairName, price, time)

        if (this._checkLiquidation(pairName, price)) return

        this._updatePositionPnL(pairName, price)
    }

    _initializePositionIfNotExists(pairName) {
        if (!this.positions[pairName]) {
            this.positions[pairName] = {
                pairName,
                positionSide: 'BOTH',
                positionAmount: 0,
                entryPrice: 0,
                liquidationPrice: 0,
                margin: 0,
                unrealizedPnL: 0,
                notional: 0,
                maintenanceMargin: 0,
                leverage: LEVERAGE,
            }
        }
    }

    _executeOrder(order, executionPrice, time) {
        const [_, quoteAsset] = order.pairName.split('/')
        
        this._initializePositionIfNotExists(order.pairName)
        
        const position = this.positions[order.pairName]
        const orderDetails = this._calculateOrderDetails(order, executionPrice, position)

        if (!this._validateMarginRequirements(order, orderDetails, quoteAsset)) return
        if (!this._validatePositionRisk(order, executionPrice)) return

        const oldPosition = { ...position }
        const realizedPnl = this._processPositionUpdate(order, position, executionPrice, oldPosition)
        
        this._updateBalance(orderDetails.feeCost, realizedPnl, quoteAsset)
        this._updatePositionDetails(position, executionPrice, orderDetails)
        this._updateWallet(position, executionPrice, orderDetails.feeCost)
        this._logPositionUpdate(position, oldPosition, quoteAsset, order.pairName)
        
        this._updateOrderAfterExecution(order, time, orderDetails.cost, orderDetails.fee, quoteAsset)
        this._updatePositionPnL(order.pairName, executionPrice)
    }

    _calculateOrderDetails(order, executionPrice, position) {
        const cost = order.quantity * executionPrice
        const fee = order.type === 'MARKET' ? this.takerFee : this.makerFee
        const margin = cost / position.leverage
        const feeCost = cost * fee
        const maintenanceMargin = cost * getMaintenanceRate(order.pairName, cost)

        return { cost, fee, margin, feeCost, maintenanceMargin }
    }

    _validateMarginRequirements(order, orderDetails, quoteAsset) {
        const position = this.positions[order.pairName]
        const unrealizedPnl = position.unrealizedPnL
        const availableBalance = this.wallet.balance + unrealizedPnl
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

    _validatePositionRisk(order, executionPrice) {
        const position = this.positions[order.pairName]
        
        // Calculate max position size based on available balance
        const availableBalance = this.wallet.balance + this.wallet.unrealizedPnL
        const maxPositionSize = (availableBalance * position.leverage) / executionPrice
        
        // Calculate new position size after order
        const direction = order.side === 'BUY' ? 1 : -1
        const newPositionSize = Math.abs(position.positionAmount + (direction * order.quantity))
        
        if (newPositionSize > maxPositionSize) {
            order.orderStatus = 'REJECTED'
            order.error = `Position size exceeds maximum allowed. Max: ${maxPositionSize}, Attempted: ${newPositionSize}`
            this.onOrderUpdate(order)
            throw new Error(order.error)
            return false
        }
        return true
    }

    _processPositionUpdate(order, position, executionPrice, oldPosition) {
        let realizedPnl = 0

        if (oldPosition.positionAmount !== 0) {
            realizedPnl = this._calculateRealizedPnl(order, oldPosition, executionPrice)
        }

        this._updatePositionAmount(order, position)
        this._updateEntryPrice(position, oldPosition, order, executionPrice)

        return realizedPnl
    }

    _calculateRealizedPnl(order, oldPosition, executionPrice) {
        const closedAmount = Math.abs(order.quantity)
        const priceDiff = executionPrice - oldPosition.entryPrice
        const positionDirection = Math.sign(oldPosition.positionAmount)
        const orderDirection = order.side === 'BUY' ? 1 : -1

        if (positionDirection !== orderDirection) {
            return closedAmount * priceDiff * positionDirection
        }
        return 0
    }

    _updatePositionAmount(order, position) {
        const direction = order.side === 'BUY' ? 1 : -1
        position.positionAmount += direction * order.quantity
        position.positionSide = position.positionAmount > 0 ? 'LONG' : position.positionAmount < 0 ? 'SHORT' : 'BOTH'
    }

    _updateEntryPrice(position, oldPosition, order, executionPrice) {
        if (position.positionAmount === 0) {
            position.entryPrice = 0
            position.unrealizedPnL = 0
            return
        }

        if (oldPosition.positionAmount === 0) {
            position.entryPrice = executionPrice
        } else if (
            Math.sign(oldPosition.positionAmount) === Math.sign(position.positionAmount) && 
            Math.abs(position.positionAmount) > Math.abs(oldPosition.positionAmount)
        ) {
            const oldNotional = Math.abs(oldPosition.positionAmount) * oldPosition.entryPrice
            const newNotional = order.quantity * executionPrice
            const totalQuantity = Math.abs(position.positionAmount)
            position.entryPrice = (oldNotional + newNotional) / totalQuantity
        } else if (Math.abs(position.positionAmount) > 0) {
            position.entryPrice = oldPosition.entryPrice
        }
    }

    _updateBalance(feeCost, realizedPnl) {
        if (realizedPnl) {
            this.wallet.balance += realizedPnl
            
            logger.info(chalk.green(
                `[PnL] Realized: ${realizedPnl} USDT`
                + `\n      Fees: ${feeCost} USDT`
                + `\n      Net: ${realizedPnl - feeCost} USDT`
                + `\n      New Balance: ${this.wallet.balance} USDT`
            ))
        }
        this.wallet.balance -= feeCost
        this.wallet.cummulativeFees += feeCost
    }

    _logPositionUpdate(position, oldPosition, quoteAsset, pairName) {
        logger.info(chalk.blue(
            `[Position] Update for ${pairName}:`
            + `\n          Size: ${position.positionAmount} (was: ${oldPosition.positionAmount})`
            + `\n          Entry: ${position.entryPrice} (was: ${oldPosition.entryPrice})`
            + `\n          Balance: ${this.wallet.balance} ${quoteAsset}`
        ))
    }

    _updatePositionPnL(pairName, currentPrice) {
        const position = this.positions[pairName]
        if (!position || position.positionAmount === 0) return

        const priceDiff = currentPrice - position.entryPrice
        const oldPnL = position.unrealizedPnL
        position.unrealizedPnL = position.positionAmount * priceDiff
        
        this._updatePositionDetails(position, currentPrice)
        this._updateWallet(position, currentPrice)
        
        if (Math.abs(position.unrealizedPnL - oldPnL) > 0.01) {
            logger.info(chalk.yellow(
                `[PnL] Update for ${pairName}: ${position.unrealizedPnL} USDT`
                + `\n      Price: ${currentPrice}`
                + `\n      Liquidation Price: ${position.liquidationPrice}`
            ))
        }
    }

    _checkLiquidation(pairName, price) {
        const position = this.positions[pairName]
        if (!position || position.positionAmount === 0) return false

        const mmRate = getMaintenanceRate(pairName, position.notional)
        const maintenanceMargin = Math.abs(position.positionAmount * price * mmRate)
        const unrealizedPnl = position.positionAmount * (price - position.entryPrice)
        const walletBalance = this.wallet.balance
        const accountEquity = walletBalance + unrealizedPnl

        if (accountEquity <= maintenanceMargin) {
            this._handleLiquidation(pairName, price)
            return true
        }
        return false
    }

    _handleLiquidation(pairName, price) {
        const position = this.positions[pairName]
        
        logger.info(chalk.red(
            `[LIQUIDATION] Position liquidated at ${price} for ${pairName}`
            + `\n             Size: ${position.positionAmount}`
            + `\n             Entry: ${position.entryPrice}`
        ))

        // Close position at liquidation price
        const liquidationOrder = {
            pairName: pairName,
            side: position.positionAmount > 0 ? 'SELL' : 'BUY',
            quantity: Math.abs(position.positionAmount),
            type: 'MARKET'
        }

        this._executeOrder(liquidationOrder, price, Date.now())
    }

    _updatePositionDetails(position, price) {
        position.notional = Math.abs(position.positionAmount * price)
        position.margin = position.notional / position.leverage
        const mmRate = getMaintenanceRate(position.pairName, position.notional)
        position.maintenanceMargin = position.notional * mmRate
        
        // Calculate liquidation price
        if (position.positionAmount !== 0) {
            const direction = Math.sign(position.positionAmount)
            const effectiveBalance = this.wallet.marginBalance - position.maintenanceMargin
            position.liquidationPrice = position.entryPrice - (direction * (effectiveBalance / Math.abs(position.positionAmount)))
        } else {
            position.liquidationPrice = 0
        }
    }

    _updateWallet(position, price) {
        this.wallet.unrealizedPnL = position.unrealizedPnL
        this.wallet.positionValue = Math.abs(position.positionAmount * price)
        this.wallet.marginBalance = this.wallet.balance + this.wallet.unrealizedPnL
        this.wallet.accountMaintenanceMargin = position.maintenanceMargin
        this.wallet.accountEquity = this.wallet.marginBalance
        this.wallet.availableBalance = this.wallet.marginBalance - position.margin
        this.wallet.accountMarginRatio = position.margin > 0 ? (this.wallet.marginBalance / position.margin) : 0
        this.wallet.actualLeverage = this.wallet.positionValue > 0 ? (this.wallet.positionValue / this.wallet.marginBalance) : 0
    }

    ____applyFundingRate____(fundingRate, pairName) {
        const position = this.positions[pairName]
        if (position && position.positionAmount !== 0) {
            const notional = position.notional
            const fundingFee = notional * fundingRate

            // If long and funding rate is positive, user pays; if short, user receives, etc.
            // For simplicity, assume a positive funding rate means longs pay, shorts receive:
            const direction = Math.sign(position.positionAmount) > 0 ? 1 : -1
            const cost = direction * fundingFee
    
            this.wallet.balance += cost // If long, cost will be negative, so wallet balance decreases
            this.wallet.cummulativeFunding += cost

            logger.info(chalk.magenta(
              `[Funding] Applied for ${pairName}: ${cost} USDT (rate: ${fundingRate * 100}%)`
              + `\n           New Balance: ${this.wallet.balance} USDT`
            ))
        }
    }
}

export { FuturesExchangeEmulator }
