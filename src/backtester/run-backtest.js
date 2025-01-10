import { getHistoricalMarketData } from './market-data/parse-market-data.js'
import { BacktestEngine } from './backtest-engine.js'
import { SpotExchangeEmulator } from '../exchanges/emulator-spot-exchange.js'
import { FuturesExchangeEmulator } from '../exchanges/emulator-futures-exchange.js'
import GridBot from '../grid-bot/grid-bot.js'
import logger from '../utils/logger.js'
import { config } from '../grid-bot/config.js'
import { TAKER_FEE, MAKER_FEE, INITIAL_BALANCES } from './config.js'
import { setupGracefulShutdown } from '../utils/graceful-shotdown.js'

async function initializeBacktestComponents(marketData) {
    try {
        const initialPrices = {
            [config.pairName]: marketData[0].price
        }

        const ExchangeEmulator = config.marketType === 'spot' ? SpotExchangeEmulator : FuturesExchangeEmulator
        const exchange = new ExchangeEmulator({
            initialBalances: INITIAL_BALANCES,
            initialPrices,
            takerFee: TAKER_FEE,
            makerFee: MAKER_FEE,
        })

        const bot = new GridBot({ ...config, exchange, isBacktest: true })
        const engine = new BacktestEngine({ initialEquity: INITIAL_BALANCES.USDT, exchange, marketData })
        
        await bot.start()

        setupGracefulShutdown(bot)

        return { exchange, bot, engine }
    } catch (error) {
        logger.error('Failed to initialize backtest components:', error)
        throw error
    }
}

async function runBacktest() {
    const startTime = performance.now()
    let counter = 0

    try {
        logger.info('Loading historical market data...')
        const marketData = await getHistoricalMarketData()

        logger.info('Initializing backtest components...')
        const { exchange, bot, engine } = await initializeBacktestComponents(marketData)

        logger.info('Processing market data...')

        for (const trade of marketData) {
            exchange.processNewPrice(config.pairName, trade.price, trade.timestamp)

            engine.recordEquityPoint(trade.price, trade.timestamp)

            // logger.debug(`Counter (index): ${counter++}/${marketData.length - 1}`)
        }

        const metrics = engine.calculatePerformanceMetrics()

        engine.logResults(metrics)

        await engine.saveResults(config.pairName, metrics)

        const endTime = performance.now()
        const executionTime = (endTime - startTime) / 1000 // Convert to seconds
        logger.info(`Total execution time: ${executionTime.toFixed(2)} seconds`)
        logger.info(`Average time per trade: ${(executionTime / marketData.length * 1000).toFixed(2)} ms`)
    } catch (error) {
        logger.error('Backtest failed:', error)
        logger.error(`Failed at index ${counter}`)
        process.exit(1)
    }
}

runBacktest()
