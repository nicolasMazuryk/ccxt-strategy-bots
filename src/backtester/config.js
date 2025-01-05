import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_MARKET_DATA_DIR = path.join(__dirname, '../../market-data')
const RAW_MARKET_DATA_DIR = path.join(BASE_MARKET_DATA_DIR, 'raw')
const AGGREGATED_MARKET_DATA_DIR = path.join(BASE_MARKET_DATA_DIR, 'aggregated')

// ===== DOWNLOAD =====
const MARKET = 'spot'
const PAIR_NAME = 'FDUSD/USDT'

const START_DATE = '2025-01-01'
const END_DATE = '2025-01-03'

// ===== FILTER =====

const PRICE_CROSSOVER_FILTER_INTERVAL = 0.0001
const IS_STABLECOIN = true

// ===== DEVELOPMENT =====
// Etalon testing period
// const START_PERIOD_TIME = '2025-01-01T00:00:00+00:00'
// const END_PERIOD_TIME = '2025-01-01T00:59:00+00:00'

// ===== BACKTEST =====
const START_PERIOD_TIME = '2025-01-01T00:00:00+00:00'
const END_PERIOD_TIME = '2025-01-01T00:59:00+00:00'

const TAKER_FEE = 0.000 // 0.1%
const MAKER_FEE = 0.000 // 0.1%

const LEVERAGE = 5
const MAINTENANCE_MARGIN_RATE = 0.0065 // https://www.binance.com/en/futures/trading-rules/perpetual/leverage-margin

const INITIAL_BALANCES = {
    USDT: 5000,
    // ETH: 1,
    FDUSD: 5000,
    // AMB: 0,
    // ACT: 0,
    // BNB: 0
}

export {
    BASE_MARKET_DATA_DIR,
    RAW_MARKET_DATA_DIR,
    AGGREGATED_MARKET_DATA_DIR,
    MARKET,
    PAIR_NAME,
    START_DATE,
    END_DATE,
    START_PERIOD_TIME,
    END_PERIOD_TIME,
    TAKER_FEE,
    MAKER_FEE,
    LEVERAGE,
    MAINTENANCE_MARGIN_RATE,
    INITIAL_BALANCES,
    PRICE_CROSSOVER_FILTER_INTERVAL,
    IS_STABLECOIN
}