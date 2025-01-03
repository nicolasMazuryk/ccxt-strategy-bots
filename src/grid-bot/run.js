import GridBot from './grid-bot.js'
import { config } from './config.js'
import { BinanceExchange } from '../exchanges/binance-exchange.js'
import logger from '../utils/logger.js'

const exchange = new BinanceExchange({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    marketType: config.marketType
})

const bot = new GridBot({ ...config, exchange })

bot.start()

async function handleShutdown(signal) {
    try {
        logger.info(`\nReceived ${signal}`)

        await bot.stop()
        process.exit(0)
    } catch (error) {
        logger.error('Error during graceful shutdown:', error)
        process.exit(1)
    }
}

process.on('SIGINT', async (error) => {
    logger.error('SIGINT Exception:', error)
    await handleShutdown('SIGINT')
})

process.on('SIGTERM', async (error) => {
    logger.error('SIGTERM Exception:', error)
    await handleShutdown('SIGTERM')
})

process.on('uncaughtException', async (error) => {
    logger.error('Uncaught Exception:', error)
    await handleShutdown('UNCAUGHT_EXCEPTION')
})

process.on('unhandledRejection', async (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
    await handleShutdown('UNHANDLED_REJECTION')
})
