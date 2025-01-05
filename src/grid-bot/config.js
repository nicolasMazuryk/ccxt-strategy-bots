// *************************************************************************************
// IMPORTANT: SPOT: Before running, deposit some dust amount of Base Asset for Taker Fees. Otherwise, the bot will not be able to place a sell order. Alternatively, deposite dust BNB for Taker Fees.
// *************************************************************************************

const riskConfig = {
    gridNumber: 50,
    investedAmount: 1250,
    leverage: 5,
    tradingFee: 0.0000,
    maintenanceMarginRate: 0.0065
}

const defaultConfig = {
    // pairName: 'ACT/USDT',
    // lowerPrice: 0.3190,
    // upperPrice: 0.3210,
    // pricePrecision: 4,
    // quantityPerGrid: 20,
    // marketType: 'linear', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: false,
    // gridStep: 0.0001,

    // pairName: 'ETH/USDT',
    // lowerPrice: 3300,
    // upperPrice: 3370,
    // pricePrecision: 2,
    // quantityPerGrid: 0.005,
    // marketType: 'linear', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: true,
    // gridStep: 2,

    // pairName: '1000SATS/USDT',
    // lowerPrice: 0.00017,
    // upperPrice: 0.00019,
    // pricePrecision: 7,
    // quantityPerGrid: 100000,
    // marketType: 'linear', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: false,
    // gridStep: 0.0000005,

    pairName: 'FDUSD/USDT',
    lowerPrice: 0.9950,
    upperPrice: 1.0050,
    pricePrecision: 4,
    quantityPerGrid: 100,
    marketType: 'linear', // spot, margin, linear, inverse, option, funding
    isInfiniteGrid: false,
    gridStep: 0.0001,

    // ===============================

    // pairName: 'FDUSD/USDT',
    // lowerPrice: 0.9950,
    // upperPrice: 1.0050,
    // pricePrecision: 4,
    // quantityPerGrid: 6,
    // marketType: 'spot', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: false,
    // gridStep: 0.0001,

    // pairName: 'ETH/FDUSD',
    // lowerPrice: 3200,
    // upperPrice: 3350,
    // pricePrecision: 2,
    // quantityPerGrid: 0.002,
    // marketType: 'spot', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: true,
    // gridStep: 3,

    // pairName: 'AMB/USDT',
    // lowerPrice: 0.0066,
    // upperPrice: 0.0081,
    // pricePrecision: 7,
    // quantityPerGrid: 800,
    // marketType: 'linear', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: false,
    // gridStep: 0.000015,

    // pairName: 'ETH/USDT',
    // lowerPrice: 3200,
    // upperPrice: 3350,
    // pricePrecision: 2,
    // quantityPerGrid: 0.0063,
    // marketType: 'linear', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: true,
    // gridStep: 3,

    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET
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
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET
} : defaultConfig

export { config, riskConfig }