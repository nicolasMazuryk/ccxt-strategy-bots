import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MARKET_DATA_DIR = path.join(__dirname, '../../market-data')

// only for market data download
const MARKET = 'spot'
const PAIR_NAME = 'ETH/USDT'

const START_DATE = '2024-12-20'
const END_DATE = '2025-01-01'

const START_PERIOD_TIME = '2025-01-01T00:00:00+00:00'
const END_PERIOD_TIME = '2025-01-01T00:59:00+00:00'

const TAKER_FEE = 0.000 // 0.1%
const MAKER_FEE = 0.000 // 0.1%

const LEVERAGE = 5

export {
    MARKET,
    PAIR_NAME,
    START_DATE,
    END_DATE,
    START_PERIOD_TIME,
    END_PERIOD_TIME,
    MARKET_DATA_DIR,
    TAKER_FEE,
    MAKER_FEE,
    LEVERAGE
}