import chalk from 'chalk'
import { CronJob } from 'cron'
import FundingBot from './funding-bot.js'
import { config } from './config.js'
import logger from '../utils/logger.js'
// import { BinanceExchange } from '../exchanges/binance-exchange.js'
import { BybitExchange } from '../exchanges/bybit-exchange.js'
import { setupGracefulShutdown } from '../utils/graceful-shotdown.js'
import { fundingRatePairsSelection } from '../funding-arbitrage/funding.js'

// const commonExchange = new BinanceExchange({ marketType: config.marketType, apiKey: config.apiKey, apiSecret: config.apiSecret })
const commonExchange = new BybitExchange({ marketType: config.marketType, apiKey: config.apiKey, apiSecret: config.apiSecret })

const selectFundingPairs = async () => {
    const { topPositiveFundingRate, topNegativeFundingRate, topAbsoluteFundingRate } = await fundingRatePairsSelection(commonExchange.exchange, config)

    if (config.isPositiveFundingOnly && !config.isNegativeFundingOnly) {
        await Promise.all(topPositiveFundingRate.map(async (fundingData) => {
            // const exchange = new BinanceExchange({ marketType: config.marketType, apiKey: config.apiKey, apiSecret: config.apiSecret })
            const exchange = new BybitExchange({ marketType: config.marketType, apiKey: config.apiKey, apiSecret: config.apiSecret })
            await exchange.exchange.loadMarkets()
            const bot = new FundingBot({ config, exchange, fundingData })
            await bot.start()
            setupGracefulShutdown(bot)
        }))
    }

    if (!config.isPositiveFundingOnly && config.isNegativeFundingOnly) {
        await Promise.all(topNegativeFundingRate.map(async (fundingData) => {
            // const exchange = new BinanceExchange({ marketType: config.marketType, apiKey: config.apiKey, apiSecret: config.apiSecret })
            const exchange = new BybitExchange({ marketType: config.marketType, apiKey: config.apiKey, apiSecret: config.apiSecret })
            await exchange.exchange.loadMarkets()
            const bot = new FundingBot({ config, exchange, fundingData })
            await bot.start()
            setupGracefulShutdown(bot)
        }))
    }

    if (config.isPositiveFundingOnly && config.isNegativeFundingOnly) {
        await Promise.all(topAbsoluteFundingRate.map(async (fundingData) => {
            // const exchange = new BinanceExchange({ marketType: config.marketType, apiKey: config.apiKey, apiSecret: config.apiSecret })
            const exchange = new BybitExchange({ marketType: config.marketType, apiKey: config.apiKey, apiSecret: config.apiSecret })
            await exchange.exchange.loadMarkets()
            const bot = new FundingBot({ config, exchange, fundingData })
            await bot.start()
            setupGracefulShutdown(bot)
        }))
    }

    logger.info(chalk.magenta('Funding Pairs Selection Is Completed'))
}

// DEVELOPMENT
// selectFundingPairs()

// PRODUCTION
new CronJob(
    '0 58 * * * *',
    // '40 * * * * *',
	async () => {
        logger.info(chalk.magenta('*'.repeat(60)))
        logger.info(chalk.magenta('*'.repeat(60)))
        logger.info(chalk.magenta(`FUNDING CYCLE ${new Date().toISOString().slice(0, 19).replace('T', ' ')}: STARTING`))
        logger.info(chalk.magenta('*'.repeat(60)))
        logger.info(chalk.magenta('*'.repeat(60)))

        await selectFundingPairs()
	},
	() => {},
	true,
	'utc'
);

logger.info(chalk.magenta('Funding Bot Started Successfully'))
