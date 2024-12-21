const ccxt = require('ccxt')

const exchange = new ccxt.binance({
    'apiKey': process.env.BINANCE_API_KEY,
    'secret': process.env.BINANCE_API_SECRET
})

async function getFundingRates() {
    try {
        // Load all markets to get USDT pairs
        const markets = await exchange.loadMarkets()
        const usdtPairs = Object.keys(markets).filter(symbol => symbol.endsWith('/USDT:USDT'))
        
        // Fetch funding rates for all USDT pairs
        const fundingRates = await exchange.fetchFundingRates(usdtPairs)
        
        return fundingRates

    } catch (error) {
        console.error('Error fetching funding rates:', error)
        throw error
    }
}

async function run() {
    try {
        const fundingRates = await getFundingRates()
        console.log('Funding rates:', fundingRates)
    } catch (error) {
        console.error('Error running program:', error)
    }
}

// Add run() to exports
module.exports = {
    getFundingRates,
}


run()