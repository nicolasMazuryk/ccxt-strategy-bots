const { SpotGridBot } = require('./spot-grid')

const API_KEY = process.env.BINANCE_API_KEY
const API_SECRET = process.env.BINANCE_API_SECRET

// IMPORTANT: Before running, deposit some dust amount of Base Asset for Taker Fees. Otherwise, the bot will not be able to place a sell order.

const bot = new SpotGridBot({
    pairName: '1MBABYDOGE/FDUSD',
    lowerPrice: 0.0038000,
    upperPrice: 0.0039000,
    gridStep: 0.0000050,
    pricePrecision: 7,
    quantityPerGrid: 1000,

    // pairName: 'ACT/FDUSD',
    // lowerPrice: 0.3350,
    // upperPrice: 0.3450,
    // gridStep: 0.0001,
    // pricePrecision: 4,
    // quantityPerGrid: 10,

    apiKey: API_KEY,
    apiSecret: API_SECRET,
})

bot.start()


async function handleShutdown(signal) {
    try {
        console.log(`\nReceived ${signal}`)

        await bot.stop()
        process.exit(0)
    } catch (error) {
        console.error('Error during graceful shutdown:', error)
        process.exit(1)
    }
}

process.on('SIGINT', async (error) => {
    console.error('SIGINT Exception:', error)
    await handleShutdown('SIGINT')
})

process.on('SIGTERM', async (error) => {
    console.error('SIGTERM Exception:', error)
    await handleShutdown('SIGTERM')
})

process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error)
    await handleShutdown('UNCAUGHT_EXCEPTION')
})

process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
    await handleShutdown('UNHANDLED_REJECTION')
})