// TODO: filter by maxFundingRate and minFundingRate. Ignore pairs with maxFundingRate < 0.02%.
// TODO: filter by market capitalization. Avoid pairs with low market cap.
// TODO: also take into account if futures price >< spot price: https://www.youtube.com/watch?v=fYncVOgQolg

import ccxt from 'ccxt'

const exchange = new ccxt.binance({
    'apiKey': process.env.BINANCE_API_KEY,
    'secret': process.env.BINANCE_API_SECRET
})

// const exchange = new ccxt.mexc({
//     'apiKey': process.env.MEXC_API_KEY,
//     'secret': process.env.MEXC_API_SECRET
// })

const UPCOMING_FUNDING_WINDOW_MINUTES = 30 // should be 5 minutes
const RATE_LIMIT_TIMEOUT_MS = 1000

const POSITIVE_FUNDING_RATE_THRESHOLD = 0.005 // 0.5%
const NEGATIVE_FUNDING_RATE_THRESHOLD = -0.01 // 1%

// Helper to split array into batches
function chunkArray(array, size) {
    const result = []
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size))
    }
    return result
}

async function main() {
    try {
        // Load all markets to get USDT pairs
        const markets = await exchange.loadMarkets()
        const usdtPairs = Object.keys(markets)
            .filter(symbol => symbol.endsWith('/USDT:USDT') && markets[symbol.replace('/USDT:USDT', '/USDT')]) // Spot pair is not needed if no hedge

        const fundingRates = await getFundingRatesCCXT(usdtPairs)
        // const fundingRates = await getFundingRatesMEXC(usdtPairs)

        const upcomingFundingRates = fundingRates.filter(rate => {
            if (!rate.fundingDatetime) return false
            const fundingTime = new Date(rate.fundingDatetime).getTime()
            const now = Date.now()
            return fundingTime > now && fundingTime <= now + UPCOMING_FUNDING_WINDOW_MINUTES * 60 * 1000
        })

        const positiveFundingRates = upcomingFundingRates
            .filter(rate => rate.fundingRate > 0)
            .sort((a, b) => (b.fundingRate || 0) - (a.fundingRate || 0))

        const negativeFundingRates = upcomingFundingRates
            .filter(rate => rate.fundingRate < 0)
            .sort((a, b) => (a.fundingRate || 0) - (b.fundingRate || 0))

        const positiveFundingRatesAboveThreshold = positiveFundingRates.filter(rate => rate.fundingRate >= POSITIVE_FUNDING_RATE_THRESHOLD)
        const negativeFundingRatesBelowThreshold = negativeFundingRates.filter(rate => rate.fundingRate <= NEGATIVE_FUNDING_RATE_THRESHOLD)

        const positiveFundingRate = positiveFundingRatesAboveThreshold[0]
        const negativeFundingRate = negativeFundingRatesBelowThreshold[0]

        return {
            positiveFundingRate,
            negativeFundingRate
        }
    } catch (error) {
        console.error('Error fetching funding rates:', error)
        throw error
    }
}

async function getFundingRatesCCXT(pairsList) {
    const allFundingRates = await exchange.fetchFundingRates(pairsList)

    return Object.values(allFundingRates)
}

async function getFundingRatesMEXC(pairsList) {
    const batches = chunkArray(pairsList, 20)
    let allFundingRates = []

    for (const batch of batches) {
        // Fetch all in parallel for this batch
        const results = await Promise.all(
            batch.map(async symbol => {
                try {
                    return await exchange.fetchFundingRate(symbol)
                } catch (err) {
                    console.error(`Error fetching funding rate for ${symbol}:`, err)
                    return null
                }
            })
        )
        allFundingRates = allFundingRates.concat(results.filter(Boolean))
        // Wait 2 seconds before next batch if not last batch
        if (batch !== batches[batches.length - 1]) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_TIMEOUT_MS))
        }
    }

    return allFundingRates
}

async function run() {
    try {
        const fundingRates = await main()
        console.log('Funding rates:', fundingRates)
    } catch (error) {
        console.error('Error running program:', error)
    }
}

// Export functions
export {
    main,
    getFundingRatesMEXC
}

run()