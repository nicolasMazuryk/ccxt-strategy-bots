import { BaseEmulator } from './emulator-base.js'
import logger from '../utils/logger.js'
import chalk from 'chalk'
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
        
        this.positions = []

        this.leverage = 1
    }

    fetchBalance() {
        return {
            info: {
                totalMaintMargin: this.wallet.accountMaintenanceMargin.toFixed(8),
                totalWalletBalance: this.wallet.balance.toFixed(8),
                totalUnrealizedProfit: this.wallet.unrealizedPnL.toFixed(8),
                totalMarginBalance: this.wallet.marginBalance.toFixed(8),
                availableBalance: this.wallet.availableBalance.toFixed(8),
                maxWithdrawAmount: this.wallet.availableBalance.toFixed(8),
                positions: this.positions.map(position => ({
                    symbol: position.pairName.replace('/', ''),
                    positionSide: position.positionSide,
                    positionAmt: position.positionAmount.toFixed(8),
                    unrealizedProfit: position.unrealizedPnL.toFixed(8),
                    notional: position.notional.toFixed(2),
                    initialMargin: (Math.abs(position.notional) / this.leverage).toFixed(8),
                    maintMargin: position.maintenanceMargin.toFixed(8),
                }))
            }
        }
    }

    fetchTrades() {
        return super.fetchTrades()
    }

    getClosedAndOpenTrades() {
        return super.getClosedAndOpenTrades()
    }

    fetchWallet() {
        return {
            wallet: { ...this.wallet },
            positions: this.positions.reduce((acc, position) => {
                if (!acc[position.pairName]) {
                    acc[position.pairName] = []
                }
                acc[position.pairName].push({ ...position })
                return acc
            }, {})
        }
    }

    setLeverage(symbol, leverage) {
        this.leverage = leverage
    }

    setHedgeMode(symbol, isHedgeMode) {
        logger.info(chalk.cyan(`HEDGE mode ${isHedgeMode ? 'Enabled' : 'Disabled'}`))
    }

    processNewPrice(pairName, price, timestamp) {
        super.processNewPrice(pairName, price, timestamp)

        if (this._checkLiquidation(pairName, price)) return

        this._updatePositionPnL(pairName, price)
    }

    _initializePositionIfNotExists(pairName, positionSide) {
        const existingPosition = this.positions.find(p => 
            p.pairName === pairName && p.positionSide === positionSide
        )
        
        if (!existingPosition) {
            this.positions.push({
                pairName,
                positionSide,
                positionAmount: 0,
                entryPrice: 0,
                liquidationPrice: 0,
                margin: 0,
                unrealizedPnL: 0,
                notional: 0,
                maintenanceMargin: 0,
                leverage: this.leverage,
            })
        }
    }

    _executeOrder(order, executionPrice, timestamp) {
        const [_, quoteAsset] = order.pairName.split('/')
        
        this._initializePositionIfNotExists(order.pairName, order.positionSide)
        
        const position = this.positions.find(p => p.pairName === order.pairName && p.positionSide === order.positionSide)

        if (!order.positionSide || !position) throw new Error(`Position not found.`)
        
        const orderDetails = this._calculateOrderDetails(order, executionPrice, position)

        if (!this._validateMarginRequirements(order, orderDetails)) return
        if (!this._validatePositionRisk(order, executionPrice)) return

        const oldPosition = { ...position }
        const realizedPnl = this._processPositionUpdate(order, position, executionPrice, oldPosition)
        
        this._updateBalance(orderDetails.feeCost, realizedPnl, quoteAsset)
        this._updatePositionDetails(position, executionPrice)
        this._updateWallet(position, executionPrice)
        this._logPositionUpdate(position, oldPosition, quoteAsset, order.pairName)
        
        this._updateOrderAfterExecution(order, timestamp, orderDetails.cost, orderDetails.fee, quoteAsset, realizedPnl)
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

    _validateMarginRequirements(order, orderDetails) {
        const unrealizedPnl = this.positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0)
        const totalMargin = this.positions.reduce((sum, pos) => sum + pos.margin, 0)
        const availableBalance = this.wallet.balance + unrealizedPnl - totalMargin
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
        const position = this.positions.find(p => p.pairName === order.pairName && p.positionSide === order.positionSide)
        
        if (!order.positionSide || !position) throw new Error(`Position not found.`)

        // Calculate total positions value across all positions, excluding the current order position
        const totalPositionValueExcludingCurrent = this.positions.reduce((sum, pos) => {
            if (pos.pairName === order.pairName && pos.positionSide === order.positionSide) return sum
            return sum + Math.abs(pos.positionAmount * this.currentPrices[pos.pairName])
        }, 0)
        
        // Add the new position value
        const direction = order.side === 'BUY' ? 1 : -1
        const newPositionAmount = position.positionAmount + (direction * order.quantity)
        const newPositionValue = Math.abs(newPositionAmount * executionPrice)
        const totalNewPositionValue = totalPositionValueExcludingCurrent + newPositionValue
        
        // Calculate max allowed position value based on available balance
        const availableBalance = this.wallet.balance + this.wallet.unrealizedPnL
        const maxTotalPositionValue = availableBalance * position.leverage
        
        if (totalNewPositionValue > maxTotalPositionValue) {
            order.orderStatus = 'REJECTED'
            order.error = `Total position value exceeds maximum allowed. Max: ${maxTotalPositionValue}, Attempted: ${totalNewPositionValue}`
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

    _updateBalance(feeCost, realizedPnl, quoteAsset) {
        if (realizedPnl) {
            this.wallet.balance += realizedPnl
            
            logger.debug(chalk.green(
                `[PnL] Realized: ${realizedPnl} ${quoteAsset}`
                + `\n      Fees: ${feeCost} ${quoteAsset}`
                + `\n      Net: ${realizedPnl - feeCost} ${quoteAsset}`
                + `\n      New Balance: ${this.wallet.balance} ${quoteAsset}`
            ))
        }
        this.wallet.balance -= feeCost
        this.wallet.cummulativeFees += feeCost
    }

    _logPositionUpdate(position, oldPosition, quoteAsset, pairName) {
        logger.debug(chalk.blue(
            `[Position] Update for ${pairName}:`
            + `\n          Size: ${position.positionAmount} (was: ${oldPosition.positionAmount})`
            + `\n          Entry: ${position.entryPrice} (was: ${oldPosition.entryPrice})`
            + `\n          Balance: ${this.wallet.balance} ${quoteAsset}`
        ))
    }

    _updatePositionPnL(pairName, currentPrice) {
        // Find positions for this pair
        const pairPositions = this.positions.filter(p => p.pairName === pairName)
        if (pairPositions.length === 0) return
        
        // Update all positions for this pair
        pairPositions.forEach(position => {
            if (position.positionAmount === 0) return
            
            const priceDiff = currentPrice - position.entryPrice
            const oldPnL = position.unrealizedPnL
            position.unrealizedPnL = position.positionAmount * priceDiff
            
            this._updatePositionDetails(position, currentPrice)
            
            if (Math.abs(position.unrealizedPnL - oldPnL) > 0.01) {
                logger.debug(chalk.yellow(
                    `[PnL] Update for ${pairName} ${position.positionSide}: ${position.unrealizedPnL} USDT`
                    + `\n      Price: ${currentPrice}`
                    + `\n      Liquidation Price: ${position.liquidationPrice}`
                ))
            }
        })
        
        this._updateWallet()
    }

    _checkLiquidation(pairName, price) {
        // Calculate total maintenance margin and unrealized PnL across all positions
        let totalMaintenanceMargin = 0
        let totalUnrealizedPnL = 0

        for (const position of this.positions) {
            if (position.positionAmount === 0) continue
            
            const currentPrice = this.currentPrices[position.pairName]
            const mmRate = getMaintenanceRate(position.pairName, Math.abs(position.positionAmount * currentPrice))
            const positionMaintenanceMargin = Math.abs(position.positionAmount * currentPrice * mmRate)
            const positionUnrealizedPnL = position.positionAmount * (currentPrice - position.entryPrice)
            
            totalMaintenanceMargin += positionMaintenanceMargin
            totalUnrealizedPnL += positionUnrealizedPnL
        }

        const accountEquity = this.wallet.balance + totalUnrealizedPnL

        if (accountEquity <= totalMaintenanceMargin) {
            this._handleLiquidation(pairName, price)
            return true
        }
        return false
    }

    _handleLiquidation(pairName, price) {
        // Close all positions when liquidation occurs
        for (const position of this.positions) {
            if (position.positionAmount === 0) continue
            
            const currentPrice = this.currentPrices[position.pairName]
            
            logger.info(chalk.red(
                `[LIQUIDATION] Position liquidated at ${currentPrice} for ${position.pairName}`
                + `\n             Side: ${position.positionSide}`
                + `\n             Size: ${position.positionAmount}`
                + `\n             Entry: ${position.entryPrice}`
            ))

            const liquidationOrder = {
                pairName: position.pairName,
                side: position.positionAmount > 0 ? 'SELL' : 'BUY',
                quantity: Math.abs(position.positionAmount),
                type: 'MARKET',
                timestamp: this.currentTimestamp,
                positionSide: position.positionSide
            }

            this._executeOrder(liquidationOrder, currentPrice, this.currentTimestamp)
        }
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

    _updateWallet() {
        // Calculate total values across all positions
        const totalUnrealizedPnL = this.positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0)
        const totalPositionValue = this.positions.reduce((sum, pos) => sum + Math.abs(pos.positionAmount * this.currentPrices[pos.pairName]), 0)
        const totalMargin = this.positions.reduce((sum, pos) => sum + pos.margin, 0)
        const totalMaintenanceMargin = this.positions.reduce((sum, pos) => sum + pos.maintenanceMargin, 0)

        // Update wallet with aggregated values
        this.wallet.unrealizedPnL = totalUnrealizedPnL
        this.wallet.positionValue = totalPositionValue
        this.wallet.marginBalance = this.wallet.balance + totalUnrealizedPnL
        this.wallet.accountMaintenanceMargin = totalMaintenanceMargin
        this.wallet.accountEquity = this.wallet.marginBalance
        this.wallet.availableBalance = this.wallet.marginBalance - totalMargin
        this.wallet.accountMarginRatio = totalMargin > 0 ? (this.wallet.marginBalance / totalMargin) : 0
        this.wallet.actualLeverage = totalPositionValue > 0 ? (totalPositionValue / this.wallet.marginBalance) : 0
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

            logger.debug(chalk.magenta(
              `[Funding] Applied for ${pairName}: ${cost} USDT (rate: ${fundingRate * 100}%)`
              + `\n           New Balance: ${this.wallet.balance} USDT`
            ))
        }
    }
}

export { FuturesExchangeEmulator }
