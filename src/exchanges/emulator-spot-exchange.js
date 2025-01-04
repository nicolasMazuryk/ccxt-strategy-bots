import { BaseEmulator } from './base-emulator.js'
import logger from '../utils/logger.js'
import chalk from 'chalk'

class SpotExchangeEmulator extends BaseEmulator {
    constructor({ initialBalances, initialPrices, takerFee, makerFee }) {
        super({ marketType: 'spot', initialPrices, takerFee, makerFee })
        this.balance = { ...initialBalances }
    }

    async fetchBalance() {
        const balances = {}
        
        for (const [asset, amount] of Object.entries(this.balance)) {
            balances[asset] = {
                free: amount,
                used: 0,
                total: amount
            }
        }

        return {
            info: { balances },
            free: { ...this.balance },
            used: Object.fromEntries(Object.keys(this.balance).map(key => [key, 0])),
            total: { ...this.balance },
            timestamp: Date.now()
        }
    }

    _executeOrder(order, executionPrice, time) {
        const [baseAsset, quoteAsset] = order.pairName.split('/')
        const cost = order.quantity * executionPrice
        const fee = order.type === 'MARKET' ? this.takerFee : this.makerFee

        if (order.side === 'BUY') {
            const totalCost = cost * (1 + fee)
            if (this.balance[quoteAsset] >= totalCost) {
                this.balance[quoteAsset] -= totalCost
                this.balance[baseAsset] += order.quantity
                logger.info(chalk.blue(
                    `[Balance] After BUY ${order.pairName}:`
                    + `\n         ${this.balance[baseAsset]} ${baseAsset}`
                    + `\n         ${this.balance[quoteAsset]} ${quoteAsset}`
                ))
                
                this._updateOrderAfterExecution(order, time, cost, fee, quoteAsset)
            } else {
                this._rejectOrder(order, `Insufficient ${quoteAsset} balance. Required: ${totalCost}, Available: ${this.balance[quoteAsset]}`)
            }
        }

        if (order.side === 'SELL') {
            if (this.balance[baseAsset] >= order.quantity) {
                const receivedAmount = cost * (1 - fee)
                this.balance[quoteAsset] += receivedAmount
                this.balance[baseAsset] -= order.quantity
                
                logger.info(chalk.blue(
                    `[Balance] After SELL ${order.pairName}:`
                    + `\n         ${this.balance[baseAsset]} ${baseAsset}`
                    + `\n         ${this.balance[quoteAsset]} ${quoteAsset}`
                ))
                
                this._updateOrderAfterExecution(order, time, cost, fee, quoteAsset)
            } else {
                this._rejectOrder(order, `Insufficient ${baseAsset} balance. Required: ${order.quantity}, Available: ${this.balance[baseAsset]}`)
            }
        }
    }

    _rejectOrder(order, errorMessage) {
        order.orderStatus = 'REJECTED'
        order.error = errorMessage
        
        this.onOrderUpdate(order)

        throw new Error(order.error)
    }
}

export { SpotExchangeEmulator } 