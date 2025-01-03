import { parse } from 'csv-parse'
import fs from 'fs'
import path from 'path'
import logger from '../../utils/logger.js'
import { START_PERIOD_TIME, END_PERIOD_TIME, MARKET_DATA_DIR } from '../config.js'

async function parseCsvMarketData(dest) {
    logger.info(`Parsing CSV file: ${dest}`)

    return new Promise((resolve, reject) => {
        const marketData = []
        const parser = parse({ 
            delimiter: ',',
            // cast: true // Enable automatic type casting
        })

        const startTime = new Date(START_PERIOD_TIME).getTime()
        const endTime = new Date(END_PERIOD_TIME).getTime()

        fs.createReadStream(dest)
            .pipe(parser)
            .on('data', ([
                aggregateTradeId,
                price,
                quantity,
                firstTradeId, 
                lastTradeId,
                timestamp,
                wasBuyerMaker,
                wasBestPriceMatch
            ]) => {
                const tradeTimestampSec = Number(timestamp) > 10000000000 
                    ? Math.floor(Number(timestamp) / 1000) 
                    : Number(timestamp)

                if (tradeTimestampSec >= startTime && tradeTimestampSec <= endTime) {
                    marketData.push({
                        id: Number(aggregateTradeId),
                        price: Number(price), 
                        quantity: Number(quantity),
                        timestamp: Number(timestamp),
                        time: new Date(tradeTimestampSec),
                        isBuyerTaker: String(wasBuyerMaker).toLowerCase() !== 'true'
                    })
                }
            })
            .on('end', () => {
                logger.info(`Successfully parsed ${marketData.length} trades from ${dest}`)
                resolve(marketData)
            })
            .on('error', (error) => {
                const msg = `Error parsing CSV file ${dest}: ${error.message}`
                logger.error(msg)
                reject(new Error(msg))
            })
    })
}

async function getHistoricalMarketData() {
    try {
        const startDate = START_PERIOD_TIME.split('T')[0]
        const endDate = END_PERIOD_TIME.split('T')[0]

        // Get all CSV files from market data directory
        const files = await fs.promises.readdir(MARKET_DATA_DIR)
        const csvFiles = files
            .filter(file => {
                if (!file.endsWith('.csv')) return false
                // Extract date from filename (assuming format includes YYYY-MM-DD)
                const fileDate = file.match(/\d{4}-\d{2}-\d{2}/)?.[0]
                if (!fileDate) return false
                // Only include files within date range
                return fileDate >= startDate && fileDate <= endDate
            })
            .sort() // Sort files chronologically

        if (csvFiles.length === 0) throw new Error('No CSV files found for the specified date range')

        logger.info(`Found ${csvFiles.length} CSV files within date range to process`)

        const allMarketData = []
        
        // Process each CSV file sequentially
        for (const file of csvFiles) {
            const filePath = path.join(MARKET_DATA_DIR, file)
            try {
                const marketData = await parseCsvMarketData(filePath)
                // Process data in chunks to avoid stack overflow
                const CHUNK_SIZE = 10000
                for (let i = 0; i < marketData.length; i += CHUNK_SIZE) {
                    const chunk = marketData.slice(i, i + CHUNK_SIZE)
                    allMarketData.push(...chunk)
                }
                logger.info(`Successfully processed ${file}`)
            } catch (error) {
                logger.error(`Failed to process ${file}: ${error.message}`)
            }
        }

        if (allMarketData.length === 0) throw new Error('No valid market data found for the specified time range')
        
        logger.info(`Finished processing all market data. Total trades: ${allMarketData.length}`)
        
        return allMarketData
    } catch (error) {
        logger.error(`Failed to process market data: ${error.message}`)
        throw error
    }
}

export { parseCsvMarketData, getHistoricalMarketData }