import { BaseEmulator } from './base-emulator.js'
import logger from '../utils/logger.js'
import chalk from 'chalk'

class SpotExchangeEmulator extends BaseEmulator {
    constructor({ initialBalances, initialPrices, takerFee, makerFee }) {
        super({ marketType: 'spot', initialPrices, takerFee, makerFee })
        this.balance = {}
        for (const [asset, amount] of Object.entries(initialBalances)) {
            this.balance[asset] = {
                total: amount,
                free: amount,
                used: 0
            }
        }
    }

    fetchBalance() {
        return this.balance
    }

    _executeOrder(order, executionPrice, time) {
        const [baseAsset, quoteAsset] = order.pairName.split('/')
        const cost = order.quantity * executionPrice
        const fee = order.type === 'MARKET' ? this.takerFee : this.makerFee

        if (order.side === 'BUY') {
            const totalCost = cost * (1 + fee)
            if (this.balance[quoteAsset].free >= totalCost) {
                this.balance[quoteAsset].free -= totalCost
                this.balance[quoteAsset].total -= totalCost

                this.balance[baseAsset].free += order.quantity
                this.balance[baseAsset].total += order.quantity
                
                this._logBalanceUpdate(order.side, order.pairName, baseAsset, quoteAsset)
                this._updateOrderAfterExecution(order, time, cost, fee, quoteAsset)
            } else {
                this._rejectOrder(order, `Insufficient ${quoteAsset} balance. Required: ${totalCost}, Available: ${this.balance[quoteAsset].free}`)
            }
        }

        if (order.side === 'SELL') {
            if (this.balance[baseAsset].free >= order.quantity) {
                const receivedAmount = cost * (1 - fee)
                this.balance[quoteAsset].free += receivedAmount
                this.balance[quoteAsset].total += receivedAmount

                this.balance[baseAsset].free -= order.quantity
                this.balance[baseAsset].total -= order.quantity
                
                this._logBalanceUpdate(order.side, order.pairName, baseAsset, quoteAsset)
                this._updateOrderAfterExecution(order, time, cost, fee, quoteAsset)
            } else {
                this._rejectOrder(order, `Insufficient ${baseAsset} balance. Required: ${order.quantity}, Available: ${this.balance[baseAsset].free}`)
            }
        }
    }

    _logBalanceUpdate(side, pairName, baseAsset, quoteAsset) {
        logger.info(chalk.blue(
            `[Balance] After ${side} ${pairName}:`
            + Object.entries(this.balance)
                .filter(([asset]) => [baseAsset, quoteAsset].includes(asset))
                .map(([asset, balance]) => `\n         ${balance.total} ${asset} (Free: ${balance.free}, Used: ${balance.used})`)
                .join('')
        ))
    }

    _rejectOrder(order, errorMessage) {
        order.orderStatus = 'REJECTED'
        order.error = errorMessage
        
        this.onOrderUpdate(order)
        throw new Error(order.error)
    }

    reserveBalance(asset, amount) {
        if (this.balance[asset].free >= amount) {
            this.balance[asset].free -= amount
            this.balance[asset].used += amount
            return true
        }
        return false
    }

    releaseBalance(asset, amount) {
        if (this.balance[asset].used >= amount) {
            this.balance[asset].used -= amount
            this.balance[asset].free += amount
            return true
        }
        return false
    }
}

export { SpotExchangeEmulator } 