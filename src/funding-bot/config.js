// *************************************************************************************
// IMPORTANT: 
// *************************************************************************************

const defaultConfig = {
    // STRATEGY
    isFundingProfitDeltaIgnoredStrategy: false,
    isFundingIgnoredDeltaProfitStrategy: false,
    isFundingLossDeltaProfitStrategy: true,

    isPositiveFundingOnly: true,
    isNegativeFundingOnly: true,

    // SELECTION
    positiveFundingRateThreshold: 0.002, // 0.2%
    negativeFundingRateThreshold: -0.002, // 0.2%
    absoluteFundingRateThreshold: 0.002, // 0.2%

    fundingPairsLimit: 5,

    // BOT PARAMETERS
    commission: 0.0005 + 0.0005, // 0.07%

    // PI = Funding Profit Delta Ignored
    PI_MinFundingRate: 0.002, // 0.8%
    PI_Slippage: 0.002, // should be 0.2%
    PI_StopLoss: 0.003, // should be 0.3%

    // IP = Funding Ignored Delta Profit
    IP_MinFundingRate: 0.001, // should be 0.8%
    IP_Slippage: 0.001, // should be 0.3%
    IP_StopLoss: 0.003, // should be 0.3%
    IP_TargetProfit: 0.002, // should be 0.3%
    IP_BreakthroughOffset: 0.0002, // should be 0.3%

    // LP = Funding Loss Delta Profit
    LP_MinFundingRate: 0.002, // should be 0.3%
    LP_Slippage: 0.001, // should be 0.3%
    LP_StopLoss: 0.003, // should be 0.3%
    LP_AcceptableLoss: 0.002, // should be 0.3%
    LP_TargetProfit: 0.003, // should be 0.2%

    // RISK MANAGEMENT
    amount: 10,
    leverage: 4,

    // EXCHANGE
    marketType: 'linear',
    isHedgeMode: true,

    // BINANCE
    // apiKey: process.env.BINANCE_API_KEY,
    // apiSecret: process.env.BINANCE_API_SECRET,
    // BYBIT
    apiKey: process.env.BYBIT_API_KEY,
    apiSecret: process.env.BYBIT_API_SECRET,
    // MEXC
    // apiKey: process.env.MEXC_API_KEY,
    // apiSecret: process.env.MEXC_API_SECRET,
    // BITGET
    // apiKey: process.env.BITGET_API_KEY,
    // apiSecret: process.env.BITGET_API_SECRET,
}

const config = process.env.NODE_ENV === 'production' ? {
    // STRATEGY
    isFundingProfitDeltaIgnoredStrategy: process.env.IS_FUNDING_PROFIT_DELTA_IGNORED_STRATEGY === 'true',
    isFundingIgnoredDeltaProfitStrategy: process.env.IS_FUNDING_IGNORED_DELTA_PROFIT_STRATEGY === 'true',
    isFundingLossDeltaProfitStrategy: process.env.IS_FUNDING_LOSS_DELTA_PROFIT_STRATEGY === 'true',
    isPositiveFundingOnly: process.env.IS_POSITIVE_FUNDING_ONLY === 'true',
    isNegativeFundingOnly: process.env.IS_NEGATIVE_FUNDING_ONLY === 'true',
    
    // SELECTION
    positiveFundingRateThreshold: parseFloat(process.env.POSITIVE_FUNDING_RATE_THRESHOLD),
    negativeFundingRateThreshold: parseFloat(process.env.NEGATIVE_FUNDING_RATE_THRESHOLD),
    absoluteFundingRateThreshold: parseFloat(process.env.ABSOLUTE_FUNDING_RATE_THRESHOLD),
    fundingPairsLimit: parseInt(process.env.FUNDING_PAIRS_LIMIT),

    // BOT PARAMETERS
    fundingRateProfitMargin: parseFloat(process.env.FUNDING_RATE_PROFIT_MARGIN),
    breakthroughOffset: parseFloat(process.env.BREAKTHROUGH_OFFSET),
    breakthroughProfitMargin: parseFloat(process.env.BREAKTHROUGH_PROFIT_MARGIN),

    // RISK MANAGEMENT
    amount: parseFloat(process.env.AMOUNT),
    leverage: parseInt(process.env.LEVERAGE),

    // EXCHANGE
    marketType: process.env.MARKET_TYPE,
    isHedgeMode: process.env.IS_HEDGE_MODE === 'true',
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET,
} : defaultConfig

export { config }