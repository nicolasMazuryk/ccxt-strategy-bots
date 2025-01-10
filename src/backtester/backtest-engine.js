import logger from '../utils/logger.js'
import MetricsCalculator from './metrics/metrics-calculator.js'
import MetricsFormatter from './metrics/metrics-formatter.js'
import fs from 'fs'
import path from 'path'
import { BACKTEST_RESULTS_DIR } from './config.js'

class BacktestEngine {
    constructor({ initialEquity, exchange, marketData }) {
        this.initialEquity = initialEquity
        this.exchange = exchange
        this.marketData = marketData
        this.equityHistory = []
        
        this.maxWalletPositionValue = 0
        this.maxWalletActualLeverage = 0
        this.maxLiquidations = 0

        this.positions = {}

        this.peak = initialEquity
        this.drawdown = 0
        this.buyAndHoldReturn = 0
    }

    recordEquityPoint(price, timestamp) {
        const { wallet, positions } = this.exchange.fetchWallet()

        this._updateWalletMetrics(wallet, price)
        this._updatePositionMetrics(positions, price)

        const point = {
            equity: wallet.accountEquity,
            balance: wallet.balance,
            unrealizedPnL: wallet.unrealizedPnL,
            availableBalance: wallet.availableBalance,

            positionValue: wallet.positionValue,
            maintenanceMargin: wallet.accountMaintenanceMargin,
            marginRatio: wallet.accountMarginRatio,
            actualLeverage: wallet.actualLeverage,

            maxWalletPositionValue: this.maxWalletPositionValue,
            maxWalletActualLeverage: this.maxWalletActualLeverage,
            maxLiquidations: this.maxLiquidations,

            positions: { ...this.positions },

            drawdown: this.drawdown,
            drawdownPercent: (this.drawdown / this.peak) * 100,
            buyAndHoldReturn: this.buyAndHoldReturn,
            buyAndHoldEquity: this.initialEquity * (1 + (this.buyAndHoldReturn / 100)),

            currentPrice: price,
            currentTimestamp: timestamp,
        }
        
        this.equityHistory.push(point)
    }

    _updateWalletMetrics(wallet, currentPrice) {
        // Position and leverage metrics
        this.maxWalletPositionValue = Math.max(this.maxWalletPositionValue, wallet.positionValue)
        this.maxWalletActualLeverage = Math.max(this.maxWalletActualLeverage, wallet.actualLeverage)

        // Liquidation check
        if (wallet.marginBalance < wallet.accountMaintenanceMargin) {
            if (!this.inMarginCall) {
                this.maxLiquidations++
                this.inMarginCall = true
            }
        } else {
            this.inMarginCall = false
        }

        // Drawdown calculations
        if (wallet.accountEquity > this.peak) {
            this.peak = wallet.accountEquity
        }
        this.drawdown = this.peak - wallet.accountEquity

        // Buy & hold calculations
        const initialPrice = this.marketData[0]?.price || 0
        if (initialPrice) {
            const priceReturn = (currentPrice - initialPrice) / initialPrice
            this.buyAndHoldReturn = priceReturn * 100
        }
    }

    _updatePositionMetrics(positions, currentPrice) {
        for (const [pairName, position] of Object.entries(positions)) {
            // Initialize metrics for new positions
            if (!this.positions[pairName]) {
                this.positions[pairName] = {
                    maxPositionSize: 0,
                    maxPositionValue: 0,
                    maxLiquidationDistance: Number.POSITIVE_INFINITY
                }
            }

            const metrics = this.positions[pairName]

            metrics.maxPositionSize = Math.max(metrics.maxPositionSize, Math.abs(position.positionAmount))
            
            metrics.maxPositionValue = Math.max(metrics.maxPositionValue, Math.abs(position.notional || 0))

            // Update liquidation distance
            if (position.positionAmount !== 0 && position.liquidationPrice) {
                const liquidationDistance = Math.abs((currentPrice - position.liquidationPrice) / currentPrice) * 100
                metrics.maxLiquidationDistance = Math.min(metrics.maxLiquidationDistance, liquidationDistance)
            }
        }
    }

    calculatePerformanceMetrics() {
        const trades = this.exchange.fetchTrades()
        const { closedTrades, openTrades } = this.exchange.getClosedAndOpenTrades()
        
        const calculator = new MetricsCalculator(
            this.initialEquity,
            this.equityHistory,
            trades,
            closedTrades,
            openTrades,
            this.marketData
        )
        const metrics = calculator.calculateAllMetrics()

        return metrics
    }

    logResults(metrics) {
        const formatter = new MetricsFormatter(metrics)
        logger.info(formatter.toConsole())
    }

    async saveResults(pairName, metrics) {
        const formatter = new MetricsFormatter(metrics)

        const symbol = pairName.replace('/', '')

        const outputDir = path.join(BACKTEST_RESULTS_DIR, symbol, new Date().toISOString())
        
        // Create output directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true })
        }

        // Save JSON results
        const jsonPath = path.join(outputDir, `${symbol}-backtest-results.json`)
        await fs.promises.writeFile(jsonPath, JSON.stringify(formatter.toJSON(), null, 2))
        logger.info(`Saved JSON results to ${jsonPath}`)

        // Save CSV results
        const csvPath = path.join(outputDir, `${symbol}-backtest-results.csv`)
        await fs.promises.writeFile(csvPath, formatter.toCSV().toString())
        logger.info(`Saved CSV results to ${csvPath}`)

        // Save equity curve data
        const equityPath = path.join(outputDir, `${symbol}-equity-curve.csv`)
        const equityData = this.equityHistory.map(point => ({
            timestamp: point.currentTimestamp,
            price: point.currentPrice,
            equity: point.equity,
            drawdown: point.drawdownPercent,
            buyAndHold: point.buyAndHoldReturn,
        }))
        await fs.promises.writeFile(
            equityPath, 
            'timestamp,price,equity,drawdown,buyAndHold\n' + 
            equityData.map(point => 
                `${point.timestamp},${point.price},${point.equity},${point.drawdown},${point.buyAndHold}`
            ).join('\n')
        )
        logger.info(`Saved equity curve data to ${equityPath}`)

        // Save closed trades and open trades history
        const { closedTrades, openTrades } = this.exchange.getClosedAndOpenTrades()
        const allTrades = [...closedTrades, ...openTrades]

        const tradesPath = path.join(outputDir, `${symbol}-trades.csv`)
        const tradeHeaders = [
            'entryTimestamp',
            'exitTimestamp',
            'positionType',
            'entryPrice',
            'exitPrice',
            'realizedPnL',
            'commission',
            'status'
        ]

        await fs.promises.writeFile(
            tradesPath,
            tradeHeaders.join(',') + '\n' +
            allTrades.map(trade => 
                tradeHeaders.map(header => trade[header]).join(',')
            ).join('\n')
        )
        logger.info(`Saved trades history (closed + open) to ${tradesPath}`)
    }
}

export { BacktestEngine }