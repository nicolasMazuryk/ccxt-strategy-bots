import { BaseEmulator } from './base-emulator.js'
import logger from '../utils/logger.js'
import chalk from 'chalk'

class SpotExchangeEmulator extends BaseEmulator {
    constructor({ initialBalance = 1000, pairName, initialPrice, takerFee, makerFee }) {
        super({ pairName, marketType: 'spot', initialPrice, takerFee, makerFee })
        
        const [baseAsset, quoteAsset] = pairName.split('/')
        this.balance = {
            [quoteAsset]: initialBalance,
            [baseAsset]: 1
        }
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
            used: Object.keys(this.balance).reduce((acc, key) => {
                acc[key] = 0
                return acc
            }, {}),
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
                this.balance[baseAsset] += order.quantity // TODO: calculation is not exact. js floating point precision issue.
                logger.info(chalk.blue(
                    `[Balance] After BUY:`
                    + `\n         ${this.balance[baseAsset]} ${baseAsset}`
                    + `\n         ${this.balance[quoteAsset]} ${quoteAsset}`
                ))
                
                this._updateOrderAfterExecution(order, time, cost, fee, quoteAsset)
                return true
            } else {
                order.orderStatus = 'REJECTED'
                order.error = `Insufficient ${quoteAsset} balance. Required: ${totalCost}, Available: ${this.balance[quoteAsset]}`
                
                this.onOrderUpdate(order)

                throw new Error(order.error)

                return false
            }
        } else {  // SELL
            if (this.balance[baseAsset] >= order.quantity) {
                const receivedAmount = cost * (1 - fee)
                this.balance[quoteAsset] += receivedAmount
                this.balance[baseAsset] -= order.quantity // TODO: calculation is not exact. js floating point precision issue.
                
                logger.info(chalk.blue(
                    `[Balance] After SELL:`
                    + `\n         ${this.balance[baseAsset]} ${baseAsset}`
                    + `\n         ${this.balance[quoteAsset]} ${quoteAsset}`
                ))
                
                this._updateOrderAfterExecution(order, time, cost, fee, quoteAsset)
                return true
            } else {
                order.orderStatus = 'REJECTED'
                order.error = `Insufficient ${baseAsset} balance. Required: ${order.quantity}, Available: ${this.balance[baseAsset]}`
                
                this.onOrderUpdate(order)

                throw new Error(order.error)
                
                return false
            }
        }
    }
}

export { SpotExchangeEmulator } 