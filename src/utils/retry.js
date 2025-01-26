import ccxt from 'ccxt'
import logger from './logger.js'
import chalk from 'chalk'
import { wait } from './utils.js'

const DEFAULT_RETRIES = 20
const DEFAULT_DELAY = 1000 // 1 second
const MAX_DELAY = 10000 // 10 seconds
const MAX_DELAY_MULTIPLIER = 2

export async function retry(fn, { retries = DEFAULT_RETRIES, delay = DEFAULT_DELAY } = {}) {
    let lastError
    let currentDelay = delay

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error
            
            // ccxt.OperationFailed is a base class for all retryable errors
            if (error instanceof ccxt.OperationFailed) {
                // If error appears in runtime - handle this error gracefully, follow this guide: https://docs.ccxt.com/#/README?id=requesttimeout
                if (error instanceof ccxt.RequestTimeout) {
                    // TO-DO:change to warning once tested
                    logger.error(chalk.yellow(
                        `REQUEST TIMEOUT (attempt ${attempt}/${retries}): ${error.message}`
                        + `\nRetrying in ${currentDelay/1000}s...`
                        + `\nTO-DO: Implement handling this exception gracefully, follow this guide: https://docs.ccxt.com/#/README?id=requesttimeout`
                    ))
                } else if (error instanceof ccxt.NetworkError) {
                    // TO-DO:change to warning once tested
                    logger.error(chalk.yellow(
                        `NETWORK EXCEPTION (attempt ${attempt}/${retries}): ${error.message}`
                        + `\nRetrying in ${currentDelay/1000}s...`
                    ))
                }
                
                await wait(currentDelay)
                currentDelay = Math.min(currentDelay * MAX_DELAY_MULTIPLIER, MAX_DELAY)
                continue
            }

            throw error
        }
    }

    logger.error(chalk.red(`All ${retries} retry attempts failed. \nLast error: ${JSON.stringify(lastError)}`))

    throw lastError
} 