const ccxt = require('bybit-api')

const { RestClientV5 } = require('bybit-api')

const client = new RestClientV5({
    key: process.env.VOLUME_TRADED_API_KEY,
    secret: process.env.VOLUME_TRADED_API_SECRET,
    testnet: false,
    recv_window: 5000
})

const symbol = 'VIRTUALUSDT'
const ORDER_AMOUNT = 10
const STOP_LOSS_RISK = 0.01 // 1%
const TAKE_PROFIT = 0.002 // 0.2%

async function placeBuyOrder() {
    try {
        // Get market info
        const { result: { list: instruments } } = await client.getInstrumentsInfo({
            category: 'spot',
            symbol: symbol
        })
        const marketInfo = instruments[0]

        const minQuantity = parseFloat(marketInfo.lotSizeFilter.minOrderQty)
        const minAmount = parseFloat(marketInfo.lotSizeFilter.minOrderAmt)

        const { result } = await client.getOrderbook({
            category: 'spot',
            symbol: symbol
        })
        const bestBidPrice = parseFloat(result.b[0][0])

        const orderAmount = ORDER_AMOUNT > minAmount ? ORDER_AMOUNT : minAmount
        const approximateOrderSize = orderAmount / bestBidPrice
        const orderSize = approximateOrderSize.toFixed(marketInfo.lotSizeScale)
        const orderCost = orderSize * bestBidPrice

        if (orderSize < minQuantity) {
            throw new Error(`Order size ${orderSize} is less than minimum ${minQuantity}`)
        }
        if (orderCost < minAmount) {
            throw new Error(`Order cost ${orderCost} is less than minimum ${minAmount}`)
        }

        const getPricePrecision = (tickSize) => {
            const decimalPlaces = tickSize.toString().split('.')[1]?.length || 0;
            return decimalPlaces;
        }
        const pricePrecision = getPricePrecision(marketInfo.priceFilter.tickSize);

        const stopLossPrice = (bestBidPrice * (1 - STOP_LOSS_RISK)).toFixed(pricePrecision);
        const takeProfitPrice = (bestBidPrice * (1 + TAKE_PROFIT)).toFixed(pricePrecision);

        const takeProfitTriggerPrice = (bestBidPrice + +marketInfo.priceFilter.tickSize).toFixed(pricePrecision);

        const order = await client.submitOrder({
            category: 'spot',
            marketUnit: 'baseCoin',
            symbol: symbol,
            side: 'Buy',
            orderType: 'Limit',
            qty: orderSize,
            price: bestBidPrice.toString(),

            stopLoss: stopLossPrice,
            slOrderType: 'Market',

            takeProfit: takeProfitTriggerPrice,
            tpLimitPrice: takeProfitPrice,
            tpOrderType: 'Limit',

        })

        console.log('Order submitted:', order)
        return order

    } catch (error) {
        console.error('Error in trading process:', error)
        throw error
    }
}

// Run the trading process
placeBuyOrder().catch(error => {
    console.error('Trading process failed:', error)
})
