class MetricsFormatter {
    constructor(metrics) {
        this.metrics = metrics
    }

    formatNumber(value, decimals = 2) {
        return Number.isFinite(value) ? value.toFixed(decimals) : 'N/A'
    }

    formatPercentage(value, decimals = 2) {
        return Number.isFinite(value) ? `${value.toFixed(decimals)}%` : 'N/A'
    }

    formatDuration(minutes) {
        if (!Number.isFinite(minutes)) return 'N/A'
        if (minutes < 60) return `${this.formatNumber(minutes, 1)}m`
        if (minutes < 1440) return `${this.formatNumber(minutes / 60, 1)}h`
        return `${this.formatNumber(minutes / 1440, 1)}d`
    }

    formatCurrency(value, decimals = 2) {
        return Number.isFinite(value) ? `$${value.toFixed(decimals)}` : 'N/A'
    }

    toConsole() {
        const m = this.metrics
        const sections = [
            {
                title: 'Profit & Loss / Returns',
                metrics: [
                    ['Equity', this.formatCurrency(m.equity.absolute), this.formatPercentage(m.equity.percentage)],
                    ['Net Profit', this.formatCurrency(m.netProfit.absolute), this.formatPercentage(m.netProfit.percentage)],
                    ['Gross Profit', this.formatCurrency(m.grossProfit.absolute), this.formatPercentage(m.grossProfit.percentage)],
                    ['Gross Loss', this.formatCurrency(m.grossLoss.absolute), this.formatPercentage(m.grossLoss.percentage)],
                    ['Buy & Hold Return', this.formatCurrency(m.buyAndHoldReturn.absolute), this.formatPercentage(m.buyAndHoldReturn.percentage)],
                    ['Annualized Return', '', this.formatPercentage(m.annualizedReturn)]
                ]
            },
            {
                title: 'Risk & Drawdown',
                metrics: [
                    ['Max Drawdown', this.formatCurrency(m.maxDrawdown.absolute), this.formatPercentage(m.maxDrawdown.percentage)],
                    ['Max Run-up', this.formatCurrency(m.maxRunup.absolute), this.formatPercentage(m.maxRunup.percentage)]
                ]
            },
            {
                title: 'Performance Ratios',
                metrics: [
                    ['Sharpe Ratio', this.formatNumber(m.sharpeRatio), ''],
                    ['Sortino Ratio', this.formatNumber(m.sortinoRatio), ''],
                    ['Calmar Ratio', this.formatNumber(m.calmarRatio), ''],
                    ['Profit Factor', this.formatNumber(m.profitFactor), ''],
                ]
            },
            {
                title: 'Trading Activity',
                metrics: [
                    ['Open Trades', m.openTrades.toString(), ''],
                    ['Closed Trades', m.closedTrades.toString(), ''],
                    ['Winning Trades', m.winningTrades.toString(), ''],
                    ['Losing Trades', m.losingTrades.toString(), ''],
                    ['Win Rate', '', this.formatPercentage(m.winRate)],
                    ['Average Trade', this.formatCurrency(m.averageTrade.absolute), this.formatPercentage(m.averageTrade.percentage, 3)],
                    ['Average Winning Trade', this.formatCurrency(m.averageWinningTrade.absolute), this.formatPercentage(m.averageWinningTrade.percentage, 3)],
                    ['Average Losing Trade', this.formatCurrency(m.averageLosingTrade.absolute), this.formatPercentage(m.averageLosingTrade.percentage, 3)],
                    ['Win/Loss Ratio', this.formatNumber(m.winLossRatio), ''],
                    ['Largest Winning Trade', this.formatCurrency(m.largestWinningTrade.absolute), this.formatPercentage(m.largestWinningTrade.percentage)],
                    ['Largest Losing Trade', this.formatCurrency(m.largestLosingTrade.absolute), this.formatPercentage(m.largestLosingTrade.percentage)],
                    ['Average Time in Trades', this.formatDuration(m.averageTimeInTrades), ''],
                    ['Average Time in Winning Trades', this.formatDuration(m.averageTimeInWinningTrades), ''],
                    ['Average Time in Losing Trades', this.formatDuration(m.averageTimeInLosingTrades), ''],
                    ['Turnover', this.formatCurrency(m.turnover.absolute), this.formatPercentage(m.turnover.percentage)]
                ]
            },
            {
                title: 'Position Sizing & Risk Management',
                metrics: [
                    ['Max Wallet Position Value', this.formatCurrency(m.maxWalletPositionValue), ''],
                    ['Max Wallet Actual Leverage', this.formatNumber(m.maxWalletActualLeverage) + 'x', ''],
                    ['Min Available Balance', this.formatCurrency(m.minAvailableBalance), ''],
                    ['Max Liquidations', m.maxLiquidations.toString(), ''],
                    ['Was Liquidated', m.wasLiquidated ? 'Yes' : 'No', ''],
                    ['Balance Below Zero', m.wasAvailableBalanceBelowZero ? 'Yes' : 'No', '']
                ]
            },
            {
                title: 'Fees & Commissions',
                metrics: [
                    ['Commission Paid', this.formatCurrency(m.commissionPaid.absolute), this.formatPercentage(m.commissionPaid.percentage)]
                ]
            }
        ]

        // Add per-position metrics section if positions exist
        if (m.positions) {
            for (const [pairName, posMetrics] of Object.entries(m.positions)) {
                sections.push({
                    title: `Position Metrics - ${pairName}`,
                    metrics: [
                        ['Max Position Size', this.formatNumber(posMetrics.maxPositionSize, 4), pairName.split('/')[0]],
                        ['Max Position Value', this.formatCurrency(posMetrics.maxPositionValue), ''],
                        ['Max Liquidation Distance', this.formatPercentage(posMetrics.maxLiquidationDistance), '']
                    ]
                })
            }
        }

        let output = '\n=== Backtest Results ===\n'
        for (const section of sections) {
            output += `\n${section.title}\n`
            output += ''.padEnd(section.title.length, '-') + '\n'
            for (const [name, value, percentage] of section.metrics) {
                output += name.padEnd(30)
                output += value.padEnd(15)
                output += percentage + '\n'
            }
        }
        return output
    }

    toJSON() {
        return this.metrics
    }

    toCSV() {
        const flattenMetrics = (obj, prefix = '') => {
            return Object.entries(obj).reduce((acc, [key, value]) => {
                const newKey = prefix ? `${prefix}_${key}` : key
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    return { ...acc, ...flattenMetrics(value, newKey) }
                }
                return { ...acc, [newKey]: value }
            }, {})
        }

        const flat = flattenMetrics(this.metrics)
        const headers = Object.keys(flat)
        const values = Object.values(flat).map(v => 
            typeof v === 'number' ? v.toString() : v === null ? '' : v.toString()
        )

        return {
            headers,
            values,
            toString: () => {
                return headers.join(',') + '\n' + values.join(',')
            }
        }
    }
}

export default MetricsFormatter 