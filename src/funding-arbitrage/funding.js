// TODO: filter by maxFundingRate and minFundingRate. Ignore pairs with maxFundingRate < 0.02%.
// TODO: filter by market capitalization. Avoid pairs with low market cap.
// TODO: also take into account if futures price >< spot price: https://www.youtube.com/watch?v=fYncVOgQolg

import { chunkArray } from '../utils/utils.js'


const UPCOMING_FUNDING_WINDOW_MINUTES = 60 // should be 5 minutes
const MIN_FUNDING_RATE_CAP = 0.0002 // 0.02%
const MEXC_RATE_LIMIT_TIMEOUT_MS = 1000

async function fundingRatePairsSelection(exchange, config) {
    const { positiveFundingRates, negativeFundingRates, absoluteFundingRates } = await getFundingRates(exchange)

    const positiveFundingRatesAboveThreshold = positiveFundingRates.filter(rate => rate.fundingRate >= config.positiveFundingRateThreshold)
    const negativeFundingRatesBelowThreshold = negativeFundingRates.filter(rate => rate.fundingRate <= config.negativeFundingRateThreshold)
    const absoluteFundingRatesAboveThreshold = absoluteFundingRates.filter(rate => Math.abs(rate.fundingRate) >= config.absoluteFundingRateThreshold)

    const topPositiveFundingRate = positiveFundingRatesAboveThreshold.slice(0, config.fundingPairsLimit)
    const topNegativeFundingRate = negativeFundingRatesBelowThreshold.slice(0, config.fundingPairsLimit)
    const topAbsoluteFundingRate = absoluteFundingRatesAboveThreshold.slice(0, config.fundingPairsLimit)

    return {
        topPositiveFundingRate,
        topNegativeFundingRate,
        topAbsoluteFundingRate
    }
}

async function getFundingRates(exchange, includeSpotPairs = false, onlyUpcomingFundingRates = false) {
    try {
        // Load all markets to get USDT pairs
        const markets = await exchange.loadMarkets()
        const usdtPairs = includeSpotPairs ? 
            Object.keys(markets).filter(symbol => symbol.endsWith('/USDT:USDT') && markets[symbol.replace('/USDT:USDT', '/USDT')]) :
            Object.keys(markets).filter(symbol => symbol.endsWith('/USDT:USDT'))

        const isMEXC = exchange.id === 'mexc'

        const fundingRates = isMEXC ? 
            await fetchExchangeFundingRatesMEXC(exchange, usdtPairs) : 
            await fetchExchangeFundingRatesCCXT(exchange, usdtPairs)

        const upcomingFundingRates = onlyUpcomingFundingRates ? 
            fundingRates
            // .filter(rate => rate.info.maxFundingRate > MIN_FUNDING_RATE_CAP)
            .filter(rate => {
                if (!rate.fundingDatetime) return false
                const fundingTime = new Date(rate.fundingDatetime).getTime()
                const now = Date.now()
                return fundingTime > now && fundingTime <= now + UPCOMING_FUNDING_WINDOW_MINUTES * 60 * 1000
            }) : 
            fundingRates
        
        const positiveFundingRates = upcomingFundingRates
            .filter(rate => rate.fundingRate > 0)
            .sort((a, b) => (b.fundingRate || 0) - (a.fundingRate || 0))

        const negativeFundingRates = upcomingFundingRates
            .filter(rate => rate.fundingRate < 0)
            .sort((a, b) => (a.fundingRate || 0) - (b.fundingRate || 0))
        
        const absoluteFundingRates = upcomingFundingRates
            .sort((a, b) => (Math.abs(b.fundingRate) || 0) - (Math.abs(a.fundingRate) || 0))

        return {
            positiveFundingRates,
            negativeFundingRates,
            absoluteFundingRates
        }
    } catch (error) {
        console.error('Error fetching funding rates:', error)
        throw error
    }
}

async function fetchExchangeFundingRatesCCXT(exchange, pairList) {
    const allFundingRates = await exchange.fetchFundingRates(pairList)

    return Object.values(allFundingRates)
}

async function fetchExchangeFundingRatesMEXC(exchange, pairList) {
    const batches = chunkArray(pairList, 20)
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
            await new Promise(resolve => setTimeout(resolve, MEXC_RATE_LIMIT_TIMEOUT_MS))
        }
    }

    return allFundingRates
}

export {
    fundingRatePairsSelection,
    getFundingRates,
    fetchExchangeFundingRatesCCXT,
    fetchExchangeFundingRatesMEXC
}