import logger from '../utils/logger.js'

class BacktestEngine {
    constructor() {
        this.trades = []
        this.equity = []
        this.startTime = null
        this.endTime = null
    }

    recordTrade(trade) {
        this.trades.push(trade)
    }

    recordEquityPoint(timestamp, exchange) {
        const baseValue = exchange.balance.base * exchange.currentPrice
        const totalEquity = exchange.balance.USDT + baseValue
        
        this.equity.push({
            timestamp,
            equity: totalEquity,
            baseBalance: exchange.balance.base,
            quoteBalance: exchange.balance.USDT,
            price: exchange.currentPrice
        })
    }

    calculatePerformanceMetrics() {
        const initialEquity = this.equity[0].equity
        const finalEquity = this.equity[this.equity.length - 1].equity
        const totalReturn = ((finalEquity - initialEquity) / initialEquity) * 100
        
        const maxDrawdown = this.calculateMaxDrawdown()
        const sharpeRatio = this.calculateSharpeRatio()
        
        return {
            totalReturn,
            initialEquity,
            finalEquity,
            maxDrawdown,
            sharpeRatio,
            duration: this.endTime - this.startTime,
            trades: this.trades.length,
            finalBaseBalance: this.equity[this.equity.length - 1].baseBalance,
            finalQuoteBalance: this.equity[this.equity.length - 1].quoteBalance
        }
    }

    calculateMaxDrawdown() {
        let maxDrawdown = 0
        let peak = this.equity[0].equity

        for (const point of this.equity) {
            if (point.equity > peak) {
                peak = point.equity
            }
            
            const drawdown = (peak - point.equity) / peak
            maxDrawdown = Math.max(maxDrawdown, drawdown)
        }

        return maxDrawdown * 100 // Convert to percentage
    }

    calculateSharpeRatio() {
        const returns = []
        for (let i = 1; i < this.equity.length; i++) {
            const returnPct = (this.equity[i].equity - this.equity[i-1].equity) / this.equity[i-1].equity
            returns.push(returnPct)
        }

        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length
        const stdDev = Math.sqrt(
            returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
        )

        // Annualized Sharpe Ratio (assuming daily returns)
        return (avgReturn * 365) / (stdDev * Math.sqrt(365))
    }

    logResults(metrics) {
        logger.info('=== Backtest Results ===')
        logger.info(`Total Return: ${metrics.totalReturn.toFixed(2)}%`)
        logger.info(`Initial Equity: $${metrics.initialEquity.toFixed(2)}`)
        logger.info(`Final Equity: $${metrics.finalEquity.toFixed(2)}`)
        logger.info(`Max Drawdown: ${metrics.maxDrawdown.toFixed(2)}%`)
        logger.info(`Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}`)
        logger.info(`Final Base Balance: ${metrics.finalBaseBalance}`)
        logger.info(`Final Quote Balance: $${metrics.finalQuoteBalance}`)
        logger.info(`Total Trades: ${metrics.trades}`)
        logger.info(`Duration: ${metrics.duration / (1000 * 60 * 60 * 24)} days`)
    }
}

export { BacktestEngine }