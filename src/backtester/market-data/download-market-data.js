import fs from 'fs'
import path from 'path'
import axios from 'axios'
import unzip from 'extract-zip'
import { createHash } from 'crypto'
import logger from '../../utils/logger.js'
import { padNumber } from '../../utils/utils.js'
import { 
  MARKET, 
  PAIR_NAME, 
  START_DATE, 
  END_DATE, 
  SYMBOL_RAW_DATA_DIR, 
  BASE_MARKET_DATA_DIR, 
  RAW_MARKET_DATA_DIR 
} from '../config.js'

// Create base URL for Binance data
const getBinanceUrl = (market, symbol, year, month, day) => {
  const filePrefix = `${symbol}-aggTrades-${year}-${month}-${day}`
  return `https://data.binance.vision/data/${market}/daily/aggTrades/${symbol}/${filePrefix}.zip`
}

// Download file from URL
async function downloadFile(url, dest) {
  logger.info(`Downloading ${url} to ${dest}`)
  const response = await axios.get(url, { responseType: 'arraybuffer' })
  await fs.promises.writeFile(dest, response.data)
}

// Validate checksum
async function validateChecksum(zipPath, checksumPath) {
  try {
    logger.info(`Validating checksum for ${zipPath}`)
    
    const checksumContent = await fs.promises.readFile(checksumPath, 'utf8')
    const expectedHash = checksumContent.split(' ')[0].trim()
    
    const fileBuffer = await fs.promises.readFile(zipPath)
    const actualHash = createHash('sha256').update(fileBuffer).digest('hex')
    
    if (actualHash !== expectedHash) {
      throw new Error('Checksum validation failed')
    }
    logger.info('Checksum validation successful')
    return true
  } catch (error) {
    logger.error(`Checksum validation failed: ${error.message}`)
    return false
  }
}

// Extract zip file and delete it afterwards
async function extractZipFile(zipPath) {
  logger.info(`Extracting ${zipPath}`)
  await unzip(zipPath, { dir: SYMBOL_RAW_DATA_DIR })
  await fs.promises.unlink(zipPath)
  logger.info(`Extracted ${zipPath}`)
}

// Get date range between start and end dates
function getDateRange(startDate, endDate) {
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number)
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number)
  
  const dates = []
  for (let year = startYear; year <= endYear; year++) {
    const monthStart = year === startYear ? startMonth : 1
    const monthEnd = year === endYear ? endMonth : 12

    for (let month = monthStart; month <= monthEnd; month++) {
      const dayStart = (year === startYear && month === startMonth) ? startDay : 1
      const dayEnd = (year === endYear && month === endMonth) ? endDay : new Date(year, month, 0).getDate()

      for (let day = dayStart; day <= dayEnd; day++) {
        dates.push({
          year: year.toString(),
          month: padNumber(month),
          day: padNumber(day)
        })
      }
    }
  }
  return dates
}

// Main download function
async function downloadMarketData(market, pairName, startDate, endDate) {
  // Create market data directories if they don't exist
  for (const dir of [BASE_MARKET_DATA_DIR, RAW_MARKET_DATA_DIR, SYMBOL_RAW_DATA_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  const symbol = pairName.replace('/', '')
  const dates = getDateRange(startDate, endDate)

  for (const { year, month, day } of dates) {
    const filePrefix = `${symbol}-aggTrades-${year}-${month}-${day}`
    const csvPath = path.join(SYMBOL_RAW_DATA_DIR, `${filePrefix}.csv`)
    
    // Skip if file already exists
    if (fs.existsSync(csvPath)) {
      continue
    }

    try {
      const url = getBinanceUrl(market, symbol, year, month, day)
      const zipPath = path.join(SYMBOL_RAW_DATA_DIR, `${filePrefix}.zip`)
      const checksumPath = path.join(SYMBOL_RAW_DATA_DIR, `${filePrefix}.zip.CHECKSUM`)
      
      await downloadFile(url, zipPath)
      await downloadFile(`${url}.CHECKSUM`, checksumPath)
      
      // Validate checksum before extracting
      const isValid = await validateChecksum(zipPath, checksumPath)
      if (!isValid) {
        throw new Error('Skipping extraction due to checksum validation failure')
      }
      
      await extractZipFile(zipPath)
      await fs.promises.unlink(checksumPath) // Clean up checksum file
    } catch (error) {
      logger.error(`Failed to download/extract data for ${year}-${month}-${day}: ${error.message}`)
    }
  }
}

// Execute
;(async () => {
  await downloadMarketData(MARKET, PAIR_NAME, START_DATE, END_DATE)
})().catch(logger.error)