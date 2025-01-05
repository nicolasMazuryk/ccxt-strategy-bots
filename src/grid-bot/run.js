import GridBot from './grid-bot.js'
import { config } from './config.js'
import { BinanceExchange } from '../exchanges/binance-exchange.js'
import { setupGracefulShutdown } from '../utils/graceful-shotdown.js'

const exchange = new BinanceExchange({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    marketType: config.marketType
})

const bot = new GridBot({ ...config, exchange })

bot.start()

setupGracefulShutdown(bot)
