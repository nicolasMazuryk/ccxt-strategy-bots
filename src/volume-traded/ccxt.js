const ccxt = require('ccxt')

const exchange = new ccxt.bybit({
    'apiKey': process.env.VOLUME_TRADED_API_KEY,
    'secret': process.env.VOLUME_TRADED_API_SECRET
})

exchange.options['maxRetriesOnFailure'] = 3 // if we get an error like the ones mentioned above we will retry up to three times per request
exchange.options['maxRetriesOnFailureDelay'] = 1000 // we will wait 1000ms (1s) between retries

const symbol = 'VIRTUAL/USDT'

const ORDER_AMOUNT = 10

const STOP_LOSS_RISK = 0.01 // 1%
const TAKE_PROFIT = 0.002 // 0.2%

async function placeBuyOrder() {
    try {
        await exchange.loadMarkets()

        const market = exchange.market(symbol)

        const minQuantity = market.limits.amount.min
        const minAmount = market.limits.cost.min

        const orderbook = await exchange.fetchOrderBook(symbol)
        const bestBidPrice = orderbook.bids[0][0]

        const orderAmount = ORDER_AMOUNT > minAmount ? ORDER_AMOUNT : minAmount

        const approximateOrderSize = orderAmount / bestBidPrice
        const orderSize = exchange.amountToPrecision(symbol, approximateOrderSize)

        const orderCost = orderSize * bestBidPrice

        if (orderSize < minQuantity) {
            throw new Error(`Order size ${orderSize} is less than minimum ${minAmount}`)
        }
        if (orderCost < minAmount) {
            throw new Error(`Order cost ${orderCost} is less than minimum ${minAmount}`)
        }

        const stopLossPrice = exchange.priceToPrecision(symbol, bestBidPrice * (1 - STOP_LOSS_RISK))
        const takeProfitPrice = exchange.priceToPrecision(symbol, bestBidPrice * (1 + TAKE_PROFIT))
        
        // const buyOrder = await exchange.createOrder(symbol, 'limit', 'buy', orderSize, bestBidPrice, {
        //     'category': 'spot',
        // })

        const params = {
            'category': 'spot',
            // 'stopLoss': stopLossPrice,
            'tpLimitPrice': takeProfitPrice,
            // 'tpOrderType': 'Limit',
        }
        const order = await exchange.createOrder(symbol, 'limit', 'buy', orderSize, bestBidPrice, params)


        console.log('Buy order placed:', order)
        
        // // Wait for buy order to fill
        // let filledBuyOrder
        // while (!filledBuyOrder) {
        //     const order = await exchange.fetchOrder(buyOrder.id, symbol)
        //     if (order.status === 'closed') {
        //         filledBuyOrder = order
        //         break
        //     }
        //     await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second before checking again
        // }

        return buyOrder
        
    } catch (error) {
        console.error('Error in trading process:', error)
        throw error
    }
}

// Run the trading process
placeBuyOrder().catch(error => {
    console.error('Trading process failed:', error)
})
