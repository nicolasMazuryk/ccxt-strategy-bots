import fs from 'fs'
import path from 'path'
import logger from '../../utils/logger.js'
import { 
  PRICE_CROSSOVER_FILTER_INTERVAL, 
  IS_STABLECOIN, 
  SYMBOL_RAW_DATA_DIR, 
  SYMBOL_AGGREGATED_DATA_DIR, 
  AGGREGATED_MARKET_DATA_DIR 
} from '../config.js'
import { parseCsvMarketData } from './parse-market-data.js'

function filterPriceLevelCrossovers(marketData, priceInterval, isStablecoin = false) {
    if (!marketData || marketData.length === 0) {
        logger.warn('No market data provided for price level filtering')
        return []
    }

    const levelCrossingTrades = []
    let lastPrice = marketData[0].price
    let lastPriceLevel = Math.floor(lastPrice / priceInterval) * priceInterval
    let nextPriceLevel = lastPriceLevel + priceInterval
    let prevPriceLevel = lastPriceLevel - priceInterval

    // Always include the first trade as initial reference point
    levelCrossingTrades.push(marketData[0])

    for (let i = 1; i < marketData.length; i++) {
        const trade = marketData[i]
        const currentPrice = trade.price
        const currentPriceLevel = Math.floor(currentPrice / priceInterval) * priceInterval

        if (isStablecoin) {
            // For stablecoins, record any price change
            if (currentPrice !== lastPrice) {
                levelCrossingTrades.push(trade)
            }
        } else {
            // For regular tokens, check price level crossings
            if (
                // Crossed upward through a level
                (lastPrice <= nextPriceLevel && currentPrice > nextPriceLevel) ||
                // Crossed downward through a level
                (lastPrice >= lastPriceLevel && currentPrice < lastPriceLevel)
            ) {
                levelCrossingTrades.push(trade)
                lastPriceLevel = currentPriceLevel
                nextPriceLevel = lastPriceLevel + priceInterval
                prevPriceLevel = lastPriceLevel - priceInterval
            }
        }
        
        lastPrice = currentPrice
    }

    const filterPercentage = ((marketData.length - levelCrossingTrades.length) / marketData.length * 100).toFixed(2)
    logger.info(`Filtered ${marketData.length} records down to ${levelCrossingTrades.length} records (${filterPercentage}% reduction)`)

    return levelCrossingTrades
}

async function filterAllMarketData(priceInterval, isStablecoin) {
    try {
        // Create aggregated directory if it doesn't exist
        if (!fs.existsSync(AGGREGATED_MARKET_DATA_DIR)) {
            fs.mkdirSync(AGGREGATED_MARKET_DATA_DIR, { recursive: true })
        }
        if (!fs.existsSync(SYMBOL_AGGREGATED_DATA_DIR)) {
            fs.mkdirSync(SYMBOL_AGGREGATED_DATA_DIR, { recursive: true })
        }

        // Get all CSV files from raw directory
        const files = await fs.promises.readdir(SYMBOL_RAW_DATA_DIR)
        const csvFiles = files.filter(file => !file.startsWith('._') && file.endsWith('.csv'))

        if (csvFiles.length === 0) {
            throw new Error('No CSV files found in raw market data directory')
        }

        logger.info(`Found ${csvFiles.length} raw market data CSV files to process`)

        // Process each file
        for (const file of csvFiles) {
            const inputPath = path.join(SYMBOL_RAW_DATA_DIR, file)
            const outputPath = path.join(SYMBOL_AGGREGATED_DATA_DIR, file)

            // Skip if output file already exists
            if (fs.existsSync(outputPath)) {
                logger.info(`Skipping ${file} - filtered market data already exists`)
                continue
            }

            try {
                const rawMarketData = await parseCsvMarketData(inputPath)
                const filteredMarketData = filterPriceLevelCrossovers(rawMarketData, priceInterval, isStablecoin)
                
                // Convert filtered market data to CSV string
                const csvContent = filteredMarketData.map(trade => 
                    `${trade.id},${trade.price},${trade.quantity},${trade.firstTradeId},${trade.lastTradeId},${trade.timestamp},${!trade.isBuyerTaker},${trade.wasBestPriceMatch}`
                ).join('\n')

                await fs.promises.writeFile(outputPath, csvContent)
                logger.info(`Successfully processed and filtered market data to ${outputPath}`)
            } catch (error) {
                logger.error(`Failed to process market data from ${file}: ${error.message}`)
            }
        }

        logger.info('Successfully processed and filtered all market data files')
    } catch (error) {
        logger.error(`Failed to process and filter market data: ${error.message}`)
        throw error
    }
}

// Execute
;(async () => {
    await filterAllMarketData(PRICE_CROSSOVER_FILTER_INTERVAL, IS_STABLECOIN)
})().catch(logger.error)