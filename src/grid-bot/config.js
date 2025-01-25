// *************************************************************************************
// IMPORTANT: SPOT: Before running, deposit some dust amount of Base Asset for Taker Fees. Otherwise, the bot will not be able to place a sell order. Alternatively, deposite dust BNB for Taker Fees.
// *************************************************************************************

const riskConfig = {
    gridNumber: 50,
    investedAmount: 250,
    leverage: 8,
    tradingFee: 0.0002,
    maintenanceMarginRate: 0.0065
}

const defaultConfig = {
    // pairName: 'ACT/USDT',
    // lowerPrice: 0.2730,
    // upperPrice: 0.2745,
    // pricePrecision: 4,
    // quantityPerGrid: 20,
    // marketType: 'linear', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: true,
    // gridStep: 0.0001,

    // pairName: 'ETH/FDUSD',
    // lowerPrice: 2000,
    // upperPrice: 4000,
    // pricePrecision: 2,
    // quantityPerGrid: 0.005,
    // marketType: 'linear', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: false,
    // gridStep: 10,

    // pairName: 'MINA/USDT',
    // lowerPrice: 0.3500,
    // upperPrice: 1.6000,
    // pricePrecision: 4,
    // quantityPerGrid: 5,
    // marketType: 'linear', // spot, margin, linear, inverse, option, funding
    // isInfiniteGrid: false,
    // gridStep: 0.0063,

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

    pairName: 'USDC/USDT',
    lowerPrice: 1.0005,
    upperPrice: 1.0044,
    quantityPerGrid: 1000,
    gridStep: 0.0050,
    marketType: 'linear', // spot, margin, linear, inverse, option, funding
    isInfiniteGrid: false,
    pricePrecision: 4,

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