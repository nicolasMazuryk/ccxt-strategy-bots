import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

// ===== DOWNLOAD =====
const MARKET = 'spot'
const PAIR_NAME = 'ETH/USDT'

const START_DATE = '2025-01-01'
const END_DATE = '2025-01-01'
// =========================

const SYMBOL = PAIR_NAME.replace('/', '')

const __dirname = dirname(fileURLToPath(import.meta.url))

const BASE_BACKTESTER_DIR = path.join(__dirname, '../../')
const BASE_MARKET_DATA_DIR = path.join(BASE_BACKTESTER_DIR, 'market-data')
const RAW_MARKET_DATA_DIR = path.join(BASE_MARKET_DATA_DIR, 'raw')
const AGGREGATED_MARKET_DATA_DIR = path.join(BASE_MARKET_DATA_DIR, 'aggregated')
const SYMBOL_RAW_DATA_DIR = path.join(RAW_MARKET_DATA_DIR, SYMBOL)
const SYMBOL_AGGREGATED_DATA_DIR = path.join(AGGREGATED_MARKET_DATA_DIR, SYMBOL)
const BACKTEST_RESULTS_DIR = path.join(BASE_BACKTESTER_DIR, 'backtest-results')
// ===== FILTER =====

const PRICE_CROSSOVER_FILTER_INTERVAL = 0.25
const IS_STABLECOIN = false

// ===== DEVELOPMENT =====
// Etalon testing period
// const START_PERIOD_TIME = '2025-01-01T00:00:00+00:00'
// const END_PERIOD_TIME = '2025-01-01T00:59:00+00:00'

// ===== BACKTEST =====
const START_PERIOD_TIME = '2024-12-30T00:00:00+00:00'
const END_PERIOD_TIME = '2025-01-01T23:59:00+00:00'

const TAKER_FEE = 0.000 // 0.1%
const MAKER_FEE = 0.000 // 0.1%

const LEVERAGE = 5
const MAINTENANCE_MARGIN_RATE = 0.0065 // https://www.binance.com/en/futures/trading-rules/perpetual/leverage-margin

const INITIAL_BALANCES = {
    USDT: 1000,
    // ETH: 1,
    FDUSD: 0,
    // AMB: 0,
    // ACT: 0,
    // BNB: 0
}

export {
    BASE_BACKTESTER_DIR,
    BASE_MARKET_DATA_DIR,
    RAW_MARKET_DATA_DIR,
    AGGREGATED_MARKET_DATA_DIR,
    SYMBOL_RAW_DATA_DIR,
    SYMBOL_AGGREGATED_DATA_DIR,
    BACKTEST_RESULTS_DIR,
    MARKET,
    PAIR_NAME,
    SYMBOL,
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