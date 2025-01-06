import { getHistoricalMarketData } from './market-data/parse-market-data.js'
import { BacktestEngine } from './backtest-engine.js'
import { SpotExchangeEmulator } from '../exchanges/emulator-spot-exchange.js'
import { FuturesExchangeEmulator } from '../exchanges/emulator-futures-exchange.js'
import GridBot from '../grid-bot/grid-bot.js'
import logger from '../utils/logger.js'
import { config } from '../grid-bot/config.js'
import { TAKER_FEE, MAKER_FEE, INITIAL_BALANCES } from './config.js'
import { setupGracefulShutdown } from '../utils/graceful-shotdown.js'

async function initializeBacktestComponents(initialPrices) {
    try {
        const ExchangeEmulator = config.marketType === 'spot' ? SpotExchangeEmulator : FuturesExchangeEmulator
        const exchange = new ExchangeEmulator({
            initialBalances: INITIAL_BALANCES,
            initialPrices,
            takerFee: TAKER_FEE,
            makerFee: MAKER_FEE,
        })

        const bot = new GridBot({ ...config, exchange })
        const engine = new BacktestEngine()

        await bot.start()

        setupGracefulShutdown(bot)

        return { exchange, bot, engine }
    } catch (error) {
        logger.error('Failed to initialize backtest components:', error)
        throw error
    }
}

async function runBacktest() {
    let counter = 0

    try {
        logger.info('Loading historical market data...')
        const marketData = await getHistoricalMarketData()
        
        const initialPrices = {
            [config.pairName]: marketData[0].price
        }

        logger.info('Initializing backtest components...')
        const { exchange, bot, engine } = await initializeBacktestComponents(initialPrices)


        logger.info('Processing market data...')
        

        const startTime = performance.now()

        for (const trade of marketData) {
            exchange.processNewPrice(config.pairName, trade.price, trade.timestamp)
            
            logger.info(`Counter (index): ${counter++}/${marketData.length - 1}`)
            
            await new Promise(resolve => setTimeout(resolve, 0))

            // engine.recordEquityPoint(trade.timestamp, exchange)
        }

        const endTime = performance.now()
        const executionTime = (endTime - startTime) / 1000 // Convert to seconds
        logger.info(`Total execution time: ${executionTime.toFixed(2)} seconds`)
        logger.info(`Average time per trade: ${(executionTime / marketData.length * 1000).toFixed(2)} ms`)


        // const metrics = engine.calculatePerformanceMetrics()
        // engine.logResults(metrics)
        
        // return metrics

        logger.info('Done')

    } catch (error) {
        logger.error('Backtest failed:', error)
        logger.error(`Failed at index ${counter}`)
        process.exit(1)
    }
}

runBacktest()


/**
 * [2025-01-06T12:19:15.077Z] INFO: Total execution time: 25.97 seconds
 * [2025-01-06T12:19:15.077Z] INFO: Average time per trade: 1.40 ms
 * 
*/