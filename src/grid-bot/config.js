// *************************************************************************************
// IMPORTANT: SPOT: 
// 1. Before running, deposit some dust amount of Base Asset for Taker Fees. Otherwise, the bot will not be able to place a sell order. Alternatively, deposite dust BNB for Taker Fees. Make sure BNB fees are enabled by API.
// 2. Do not place LIMIT orders manually. Filled LIMIT order creates additional grid level, event if out of grid range. Manually only MARKET, STOP_MARKET, TAKE_PROFIT_MARKET order allowed.
//      2.1 SPOT: buy additional BASE asset to be able to place EXIT order.
// *************************************************************************************

const riskConfig = {
    investedAmount: 1000,
    tradingFee: 0.000, // 0.0002
    maintenanceMarginRate: 0.0065,
    pricePrecision: 2,
    leverage: 2,

    // gridNumber: 100,

    gridStep: 5,
    lowerPrice: 1900,
    upperPrice: 2300,
    quantityPerGrid: 0.01,
}

const defaultConfig = {
    // pairName: 'ACT/USDT',
    // lowerPrice: 0.2000,
    // upperPrice: 0.3000,
    // pricePrecision: 4,
    // quantityPerGrid: 30,
    // marketType: 'linear', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: false,
    // gridStep: 0.0001,
    // stopLoss: 0.2060,
    // takeProfit: 0.2075, 
    // leverage: 5,

    pairName: 'ETH/USDT',
    lowerPrice: 3200,
    upperPrice: 3250,
    pricePrecision: 2,
    quantityPerGrid: 0.055,
    marketType: 'linear', // spot, linear, hedge
    isInfiniteGrid: false,
    isHedgeMode: true,
    gridStep: 10,
    // stopLoss: 2145,
    // takeProfit: 1775, 
    leverage: 4,

    // pairName: 'MINA/USDT',
    // pricePrecision: 4,
    // marketType: 'linear', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: false,
    // leverage: 3,
    // // stopLoss: 1000,
    // // takeProfit: 5000, 
    // gridStep: 0.0025,
    // lowerPrice: 0.4000,
    // upperPrice: 0.6500,
    // quantityPerGrid: 30,

    // pairName: 'BTC/USDT',
    // pricePrecision: 1,
    // marketType: 'linear', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: true,
    // leverage: 1,
    // // stopLoss: 1000,
    // // takeProfit: 5000, 
    // gridStep: 400,
    // lowerPrice: 16000,
    // upperPrice: 18000,
    // quantityPerGrid: 0.01110,

    // pairName: 'LTC/USDT',
    // pricePrecision: 2,
    // marketType: 'linear', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: false,
    // leverage: 1,
    // // stopLoss: 1000,
    // // takeProfit: 5000, 
    // gridStep: 0.40,
    // lowerPrice: 60,
    // upperPrice: 90,
    // quantityPerGrid: 0.15,

    // pairName: '1000SATS/USDT',
    // lowerPrice: 0.00017,
    // upperPrice: 0.00019,
    // pricePrecision: 7,
    // quantityPerGrid: 100000,
    // marketType: 'linear', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: false,
    // gridStep: 0.0000005,

    // pairName: 'USDP/USDT',
    // lowerPrice: 1.0005,
    // upperPrice: 1.0044,
    // quantityPerGrid: 249,
    // gridStep: 0.0010,
    // marketType: 'spot', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: false,
    // pricePrecision: 4,

    // pairName: 'USDC/USDT',
    // lowerPrice: 1.0005,
    // upperPrice: 1.0044,
    // quantityPerGrid: 1000,
    // gridStep: 0.0050,
    // marketType: 'linear', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: false,
    // pricePrecision: 4,

    // ===============================

    // pairName: 'USDP/USDT',
    // lowerPrice: 1.0005,
    // upperPrice: 1.0044,
    // quantityPerGrid: 249,
    // gridStep: 0.0010,
    // marketType: 'spot', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: false,
    // pricePrecision: 4,

    // pairName: 'ETH/FDUSD',
    // lowerPrice: 3100,
    // upperPrice: 3600,
    // pricePrecision: 2,
    // quantityPerGrid: 0.002,
    // marketType: 'spot', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: true,
    // gridStep: 10,

    // pairName: 'AMB/USDT',
    // lowerPrice: 0.0065,
    // upperPrice: 0.0095,
    // pricePrecision: 7,
    // quantityPerGrid: 800,
    // marketType: 'linear', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: false,
    // gridStep: 0.0000273,

    // pairName: 'ETH/USDT',
    // lowerPrice: 3100,
    // upperPrice: 3600,
    // pricePrecision: 2,
    // quantityPerGrid: 0.0075,
    // marketType: 'linear', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: true,
    // gridStep: 10,

    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
}

const config = process.env.NODE_ENV === 'production' ? {
    pairName: process.env.PAIR_NAME,
    lowerPrice: parseFloat(process.env.LOWER_PRICE),
    upperPrice: parseFloat(process.env.UPPER_PRICE), 
    gridStep: parseFloat(process.env.GRID_STEP),
    pricePrecision: parseInt(process.env.PRICE_PRECISION),
    quantityPerGrid: parseFloat(process.env.QUANTITY_PER_GRID),
    marketType: process.env.MARKET_TYPE,
    isInfiniteGrid: process.env.IS_INFINITE_GRID === 'true',
    isHedgeMode: process.env.IS_HEDGE_MODE === 'true',
    stopLoss: parseFloat(process.env.STOP_LOSS),
    takeProfit: parseFloat(process.env.TAKE_PROFIT),
    leverage: parseInt(process.env.LEVERAGE),
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET
} : defaultConfig

export { config, riskConfig }