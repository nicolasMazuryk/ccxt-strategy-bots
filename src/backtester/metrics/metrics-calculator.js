import logger from '../../utils/logger.js'

class MetricsCalculator {
    constructor(initialEquity, equityHistory, trades, closedTrades, openTrades, marketData) {
        this.initialEquity = initialEquity
        this.equityHistory = equityHistory
        this.trades = trades
        this.closedTrades = closedTrades
        this.openTrades = openTrades
        this.marketData = marketData

        this.metrics = {}
    }

    calculateAllMetrics() {
        this.calculateProfitAndLossMetrics()
        this.calculateRiskAndDrawdownMetrics()
        this.calculatePerformanceRatios()
        this.calculateTradingActivityMetrics()
        this.calculatePositionSizingMetrics()
        this.calculateFeeMetrics()
        return this.metrics
    }

    calculateProfitAndLossMetrics() {
        const finalEquity = this.equityHistory[this.equityHistory.length - 1]?.equity || this.initialEquity
        const netProfit = finalEquity - this.initialEquity
        const netProfitPercent = (netProfit / this.initialEquity) * 100

        // Calculate gross profit and loss
        const profitableTrades = this.trades.filter(trade => trade.realizedPnL > 0)
        const unprofitableTrades = this.trades.filter(trade => trade.realizedPnL < 0)
        const grossProfit = profitableTrades.reduce((sum, trade) => sum + trade.realizedPnL, 0)
        const grossLoss = unprofitableTrades.reduce((sum, trade) => sum + trade.realizedPnL, 0)

        // Calculate buy & hold return
        const firstPrice = this.marketData[0]?.price
        const lastPrice = this.marketData[this.marketData.length - 1]?.price
        const buyAndHoldReturn = firstPrice && lastPrice 
            ? ((lastPrice - firstPrice) / firstPrice) * 100 
            : 0

        // Calculate annualized return
        const firstTimestamp = this.marketData[0]?.timestamp
        const lastTimestamp = this.marketData[this.marketData.length - 1]?.timestamp
        const yearFraction = (lastTimestamp - firstTimestamp) / (365 * 24 * 60 * 60 * 1000)
        const annualizedReturn = yearFraction > 0
            ? (netProfitPercent / 100) / yearFraction
            : 0

        Object.assign(this.metrics, {
            equity: {
                absolute: finalEquity,
                percentage: ((finalEquity / this.initialEquity) - 1) * 100
            },
            netProfit: {
                absolute: netProfit,
                percentage: netProfitPercent
            },
            grossProfit: {
                absolute: grossProfit,
                percentage: (grossProfit / this.initialEquity) * 100
            },
            grossLoss: {
                absolute: grossLoss,
                percentage: (grossLoss / this.initialEquity) * 100
            },
            buyAndHoldReturn: {
                absolute: this.initialEquity * (1 + buyAndHoldReturn / 100),
                percentage: buyAndHoldReturn
            },
            annualizedReturn: annualizedReturn * 100
        })
    }

    calculateRiskAndDrawdownMetrics() {
        let maxDrawdown = 0
        let maxDrawdownPercent = 0
        let peak = this.initialEquity
        let maxRunup = 0
        let maxRunupPercent = 0
        let trough = this.initialEquity

        this.equityHistory.forEach(point => {
            // Drawdown calculations
            if (point.equity > peak) {
                peak = point.equity
            }
            const drawdown = peak - point.equity
            const drawdownPercent = (drawdown / peak) * 100
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown
                maxDrawdownPercent = drawdownPercent
            }

            // Run-up calculations
            if (point.equity < trough) {
                trough = point.equity
            }
            const runup = point.equity - trough
            const runupPercent = (runup / trough) * 100
            if (runup > maxRunup) {
                maxRunup = runup
                maxRunupPercent = runupPercent
            }
        })

        Object.assign(this.metrics, {
            maxDrawdown: {
                absolute: maxDrawdown,
                percentage: maxDrawdownPercent
            },
            maxRunup: {
                absolute: maxRunup,
                percentage: maxRunupPercent
            },
        })
    }

    calculatePerformanceRatios() {
        // Calculate Sharpe Ratio
        const returns = this.calculateDailyReturns()
        const riskFreeRate = 0.02 // 2% annual risk-free rate
        const dailyRiskFree = Math.pow(1 + riskFreeRate, 1/365) - 1
        const excessReturns = returns.map(r => r - dailyRiskFree)
        const meanExcessReturn = this.mean(excessReturns)
        const stdExcessReturn = this.standardDeviation(excessReturns)
        const sharpeRatio = stdExcessReturn !== 0 
            ? (meanExcessReturn / stdExcessReturn) * Math.sqrt(365) 
            : 0

        // Calculate Sortino Ratio
        const downside = returns.filter(r => r < 0)
        const downsideDeviation = this.standardDeviation(downside)
        const sortinoRatio = downsideDeviation !== 0 
            ? (meanExcessReturn / downsideDeviation) * Math.sqrt(365) 
            : 0

        // Calculate Profit Factor
        const grossProfit = this.metrics.grossProfit.absolute
        const grossLoss = Math.abs(this.metrics.grossLoss.absolute)
        const profitFactor = grossLoss !== 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0

        // Calculate Calmar Ratio
        const maxDrawdownDecimal = this.metrics.maxDrawdown.percentage / 100
        const calmarRatio = maxDrawdownDecimal !== 0 
            ? this.metrics.annualizedReturn / maxDrawdownDecimal 
            : 0

        Object.assign(this.metrics, {
            sharpeRatio,
            sortinoRatio,
            calmarRatio,
            profitFactor,
        })
    }

    calculateTradingActivityMetrics() {
        const winningTrades = this.closedTrades.filter(trade => trade.realizedPnL > 0)
        const losingTrades = this.closedTrades.filter(trade => trade.realizedPnL < 0)

        const winRate = (winningTrades.length / this.closedTrades.length) * 100 || 0

        const avgWinning = winningTrades.length > 0
            ? winningTrades.reduce((sum, trade) => sum + trade.realizedPnL, 0) / winningTrades.length
            : 0

        const avgLosing = losingTrades.length > 0
            ? losingTrades.reduce((sum, trade) => sum + trade.realizedPnL, 0) / losingTrades.length
            : 0

        const largestWin = winningTrades.reduce((max, trade) => 
            Math.max(max, trade.realizedPnL), 0)

        const largestLoss = losingTrades.reduce((min, trade) => 
            Math.min(min, trade.realizedPnL), 0)

        // Calculate trade durations in minutes
        const tradeDurations = this.closedTrades
            .map(trade => (trade.exitTimestamp - trade.entryTimestamp) / (60 * 1000))

        const winningTradeDurations = winningTrades
            .map(trade => (trade.exitTimestamp - trade.entryTimestamp) / (60 * 1000))

        const losingTradeDurations = losingTrades
            .map(trade => (trade.exitTimestamp - trade.entryTimestamp) / (60 * 1000))

        Object.assign(this.metrics, {
            openTrades: this.openTrades.length,
            closedTrades: this.closedTrades.length,
            winningTrades: winningTrades.length,
            losingTrades: losingTrades.length,
            winRate,
            averageTrade: {
                absolute: this.closedTrades.reduce((sum, trade) => sum + trade.realizedPnL, 0) / this.closedTrades.length || 0,
                percentage: (this.metrics.netProfit.percentage / this.closedTrades.length) || 0
            },
            averageWinningTrade: {
                absolute: avgWinning,
                percentage: (avgWinning / this.initialEquity) * 100
            },
            averageLosingTrade: {
                absolute: avgLosing,
                percentage: (avgLosing / this.initialEquity) * 100
            },
            winLossRatio: Math.abs(avgLosing) !== 0 ? avgWinning / Math.abs(avgLosing) : avgWinning > 0 ? Infinity : 0,
            largestWinningTrade: {
                absolute: largestWin,
                percentage: (largestWin / this.initialEquity) * 100
            },
            largestLosingTrade: {
                absolute: largestLoss,
                percentage: (largestLoss / this.initialEquity) * 100
            },
            averageTimeInTrades: this.mean(tradeDurations) || 0,
            averageTimeInWinningTrades: this.mean(winningTradeDurations) || 0,
            averageTimeInLosingTrades: this.mean(losingTradeDurations) || 0,
            turnover: this.calculateTurnover()
        })
    }

    calculatePositionSizingMetrics() {
        // Use the last recorded values from equity history
        const lastPoint = this.equityHistory[this.equityHistory.length - 1]

        // Calculate wallet-level metrics
        Object.assign(this.metrics, {
            maxWalletPositionValue: lastPoint.maxWalletPositionValue,
            maxWalletActualLeverage: lastPoint.maxWalletActualLeverage,
            minAvailableBalance: this.equityHistory.reduce((min, point) => 
                Math.min(min, point.availableBalance), Infinity),
            maxLiquidations: lastPoint.maxLiquidations,

            wasAvailableBalanceBelowZero: this.equityHistory.some(point => point.availableBalance <= 0),
            wasLiquidated: lastPoint.maxLiquidations > 0,
            
            // Add per-position metrics
            positions: Object.entries(lastPoint.positions).reduce((acc, [pairName, metrics]) => {
                acc[pairName] = {
                    maxPositionSize: metrics.maxPositionSize,
                    maxPositionValue: metrics.maxPositionValue,
                    maxLiquidationDistance: metrics.maxLiquidationDistance
                }
                return acc
            }, {})
        })
    }

    calculateFeeMetrics() {
        const commissionPaid = this.trades.reduce((sum, trade) => sum + (trade.commission || 0), 0)

        Object.assign(this.metrics, {
            commissionPaid: {
                absolute: commissionPaid,
                percentage: (commissionPaid / this.initialEquity) * 100
            },
        })
    }

    // Helper methods
    calculateDailyReturns() {
        const dailyEquity = this.groupEquityByDay()
        const returns = []
        
        for (let i = 1; i < dailyEquity.length; i++) {
            const dailyReturn = (dailyEquity[i] - dailyEquity[i-1]) / dailyEquity[i-1]
            returns.push(dailyReturn)
        }
        
        return returns
    }

    groupEquityByDay() {
        const dailyEquity = []
        let currentDay = null
        let lastEquity = null

        for (const point of this.equityHistory) {
            const date = new Date(point.currentTimestamp).toDateString()
            if (date !== currentDay) {
                if (lastEquity !== null) {
                    dailyEquity.push(lastEquity)
                }
                currentDay = date
            }
            lastEquity = point.equity
        }

        if (lastEquity !== null) {
            dailyEquity.push(lastEquity)
        }

        return dailyEquity
    }

    calculateTurnover() {
        const totalVolume = this.trades.reduce((sum, trade) => sum + Math.abs(trade.cost), 0)
        const averageEquity = this.mean(this.equityHistory.map(point => point.equity))
        
        return {
            absolute: totalVolume,
            percentage: averageEquity > 0 ? (totalVolume / averageEquity) * 100 : 0
        }
    }

    mean(array) {
        return array.length > 0 ? array.reduce((a, b) => a + b) / array.length : 0
    }

    standardDeviation(array) {
        const avg = this.mean(array)
        const squareDiffs = array.map(value => Math.pow(value - avg, 2))
        return Math.sqrt(this.mean(squareDiffs))
    }
}

export default MetricsCalculator 