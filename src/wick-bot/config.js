// *************************************************************************************
// IMPORTANT: SPOT: 
// 1. Before running, deposit some dust amount of Base Asset for Taker Fees. Otherwise, the bot will not be able to place a sell order. Alternatively, deposite dust BNB for Taker Fees. Make sure BNB fees are enabled by API.
// 2. Do not place LIMIT orders manually. Filled LIMIT order creates additional grid level, event if out of grid range. Manually only MARKET, STOP_MARKET, TAKE_PROFIT_MARKET order allowed.
//      2.1 SPOT: buy additional BASE asset to be able to place EXIT order.
// *************************************************************************************

const defaultConfig = {
    pairName: 'ETH/USDT',
    pricePrecision: 2,
    quantity: 0.055,
    marketType: 'linear', // spot, linear, hedge
    isHedgeMode: false,
    leverage: 4,
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
    
    // Wick bot specific parameters
    maxHistoricalCandleLookback: 100, // The max number of candles between the current candle and historical candle
    minHistoricalCandleLookback: 0,   // The min number of candles between the current candle and the first historical candle
    minHistoricalWickSize: 0.5,       // The minimum wick size (in percentage) used to qualify a candle as having a valid wick
    minCurrentWickSize: 0.3,          // The minimum difference (in percentage) between the end of the historical wick and the low of the current candle
}

const config = process.env.NODE_ENV === 'production' ? {
    pairName: process.env.PAIR_NAME,
    pricePrecision: parseInt(process.env.PRICE_PRECISION),
    quantity: parseFloat(process.env.QUANTITY),
    marketType: process.env.MARKET_TYPE,
    isHedgeMode: process.env.IS_HEDGE_MODE === 'true',
    leverage: parseInt(process.env.LEVERAGE),
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET,
    
    // Wick bot specific parameters
    maxHistoricalCandleLookback: parseInt(process.env.MAX_HISTORICAL_CANDLE_LOOKBACK || '100'),
    minHistoricalCandleLookback: parseInt(process.env.MIN_HISTORICAL_CANDLE_LOOKBACK || '0'),
    minHistoricalWickSize: parseFloat(process.env.MIN_HISTORICAL_WICK_SIZE || '0.5'),
    minCurrentWickSize: parseFloat(process.env.MIN_CURRENT_WICK_SIZE || '0.3')
} : defaultConfig

export { config }