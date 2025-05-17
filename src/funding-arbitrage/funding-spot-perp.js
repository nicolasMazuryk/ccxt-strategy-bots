import { getFundingRates } from './funding.js'
import ccxt from 'ccxt'
import { config } from '../funding-bot/config.js'

const exchange = new ccxt.bitget({
    apiKey: config.apiKey,
    secret: config.apiSecret,
})

const fundingRates = await getFundingRates(exchange, true)

console.log(fundingRates)