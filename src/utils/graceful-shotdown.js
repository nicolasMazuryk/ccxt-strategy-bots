import logger from './logger.js'

async function handleShutdown(signal, bot) {
    try {
        logger.info(`\nReceived ${signal}`)
        await bot.stop()
    } catch (error) {
        logger.error('Error during graceful shutdown:', error)
        process.exit(1)
    }
}

export function setupGracefulShutdown(bot) {
    process.on('SIGINT', async (error) => {
        logger.error('SIGINT Exception:', error)
        await handleShutdown('SIGINT', bot)
    })

    process.on('SIGTERM', async (error) => {
        logger.error('SIGTERM Exception:', error)
        await handleShutdown('SIGTERM', bot)
    })

    process.on('uncaughtException', async (error) => {
        logger.error('Uncaught Exception:', error)
        await handleShutdown('UNCAUGHT_EXCEPTION', bot)
    })

    process.on('unhandledRejection', async (reason, promise) => {
        logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
        await handleShutdown('UNHANDLED_REJECTION', bot)
    })

    // setTimeout(async () => {
    //     logger.info('Sending SIGINT signal...')
    //     process.emit('SIGINT')
    // }, 30000)
}
