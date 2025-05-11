import logger from './logger.js'

const bots = []

export function setupGracefulShutdown(bot) {
    bots.push(bot)
}

export function removeBotFromGracefulShutdown(bot) {
    const index = bots.findIndex(b => b === bot)
    if (index !== -1) {
        bots.splice(index, 1)
    }
}

async function handleShutdown(signal) {
    try {
        logger.info(`Graceful shutdown initiated - received ${signal} signal`)

        for (const bot of bots) {
            try {
                await bot.stop()
            } catch (error) {
                logger.error(`Failed to stop bot: ${error.message}`)
            }
        }

        process.exit(1)
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

// setTimeout(async () => {
//     logger.info('Sending SIGINT signal...')
//     process.emit('SIGINT')
// }, 160000)
