const ccxt = require('ccxt')
const {
    WebsocketClient,
    DefaultLogger,
    isWsFormattedSpotUserDataExecutionReport,
} = require('binance')


class SpotGridBot {
    constructor({
        pairName,
        lowerPrice,
        upperPrice,
        gridStep,
        quantityPerGrid,
        pricePrecision,
        apiKey,
        apiSecret,
    }) {
        this.pairName = pairName
        this.lowerPrice = lowerPrice
        this.upperPrice = upperPrice
        this.gridStep = gridStep
        this.quantityPerGrid = quantityPerGrid
        this.pricePrecision = pricePrecision

        this.gridLevels = []

        this.gridInitializationBestAskPrice = 0

        this.isProcessingOrderbookBestBidAskUpdateEvent = false
        this.isShuttingDown = false

        this.wsClient = new WebsocketClient(
            {
              api_key: apiKey,
              api_secret: apiSecret,
              beautify: true,
              logger: DefaultLogger
            },
        )

        this.exchange = new ccxt.binance({
            apiKey: apiKey,
            secret: apiSecret,
            options: {
                'defaultType': 'spot'
            }
        })

        this.exchange.options['maxRetriesOnFailure'] = 300
        this.exchange.options['maxRetriesOnFailureDelay'] = 2000
    }

    generateGridLevels() {
        const levels = []
        let currentPrice = this.lowerPrice
        
        while (currentPrice <= this.upperPrice) {
            levels.push(currentPrice)
            currentPrice = parseFloat((currentPrice + this.gridStep).toFixed(this.pricePrecision))
        }
        
        this.gridLevels = levels
        return levels
    }

    calculateTotalCapital() {
        const totalCapital = this.gridLevels.reduce((sum, price) => {
            return sum + (price * this.quantityPerGrid)
        }, 0)
        return Number(totalCapital).toFixed(2)
    }

    async initializeWebSocketHandlers() {
        this.wsClient.on('formattedMessage', (data) => {
            if (this.isShuttingDown) return
            
            if (isWsFormattedSpotUserDataExecutionReport(data)) {
                return this.handleOrderUpdate(data)
              }

            if (data.eventType === 'bookTicker') {
                return this.onOrderbookBestBidAskUpdateEvent(data)
            }
        })
        
        this.wsClient.on('open', (data) => {
            console.log('WS connection opened:', data.wsKey, data.ws.target.url)
        })
        
        this.wsClient.on('reconnecting', (data) => {
            console.log('ws automatically reconnecting.... ', data?.wsKey)
        })
        
        // receive notification that a reconnection completed successfully (e.g use REST to check for missing data)
        this.wsClient.on('reconnected', (data) => {
            if (this.isShuttingDown) return

            if (
                typeof data?.wsKey === 'string' &&
                data.wsKey.toLowerCase().includes('userdata')
              ) {
                console.log('ws for user data stream has reconnected ', data?.wsKey)
                // This is a good place to check your own state is still in sync with the account state on the exchange, in case any events were missed while the library was reconnecting:
                // - fetch balances
                // - fetch positions
                // - fetch orders
              } else {
                console.log('ws has reconnected ', data?.wsKey)
              }
        })
        
        this.wsClient.on('error', (data) => {
            console.log('WS ERROR ', data?.wsKey)
        })
    }

    async onOrderbookBestBidAskUpdateEvent(data) {
        if (this.isProcessingOrderbookBestBidAskUpdateEvent || this.isShuttingDown) return

        const askPrice = data.askPrice

        if (askPrice <= this.gridInitializationBestAskPrice) return

        this.isProcessingOrderbookBestBidAskUpdateEvent = true

        console.log('New best ask price', askPrice)

        for (const level of this.gridLevels) {
            if (level >= askPrice || level < this.gridInitializationBestAskPrice) {
                continue
            }

            console.log(`New grid level at ${level}`)

            await this.placeBuyOrder(level)
        }

        this.gridInitializationBestAskPrice = askPrice

        this.isProcessingOrderbookBestBidAskUpdateEvent = false
    }

    async handleOrderUpdate(order) {
        const { orderStatus, side, price } = order
        
        if (orderStatus === 'FILLED') {
            console.log(`Filled ${side.toUpperCase()} order at ${price}`)

            if (side === 'BUY') {
                await this.placeSellOrder(
                    Number((parseFloat(price) + this.gridStep).toFixed(this.pricePrecision))
                )
            } else {
                await this.placeBuyOrder(
                    Number((parseFloat(price) - this.gridStep).toFixed(this.pricePrecision))
                )
            }
        }
    }

    async placeBuyOrder(price) {
        try {
            const order = await this.exchange.createLimitBuyOrder(this.pairName, this.quantityPerGrid, price)
            
            console.log(`Buy order placed at ${price}`)
            return order
        } catch (error) {
            console.error('Error placing buy order:', error)
        }
    }

    async placeSellOrder(price) {
        try {
            const order = await this.exchange.createLimitSellOrder(this.pairName, this.quantityPerGrid, price)
            
            console.log(`Sell order placed at ${price}`)
            return order
        } catch (error) {
            console.error('Error placing sell order:', error)
        }
    }

    async initializeGrid() {
        try {
            this.generateGridLevels()

            const totalCapital = this.calculateTotalCapital()

            await this.initializeWebSocketHandlers()

            this.wsClient.subscribeSpotUserDataStream()

            const orderbook = await this.exchange.fetchOrderBook(this.pairName)

            this.gridInitializationBestAskPrice = orderbook.asks[0][0]

            console.log('Initializing grid with best ask price', this.gridInitializationBestAskPrice)

            for (const level of this.gridLevels) {
                if (level < this.gridInitializationBestAskPrice) {
                    await this.placeBuyOrder(level)
                }
            }

            this.wsClient.subscribeSpotSymbolBookTicker(this.pairName.replace('/', ''))

        } catch (error) {
            console.error('Error initializing grid:', error)
            throw error // Re-throw to handle in start()
        }
    }

    async start() {
        console.log('Starting Stablecoin Grid Bot...')

        try {
            await this.initializeGrid()


            // console.log('Bot will run for 1 minute before stopping...')
            // await new Promise(resolve => setTimeout(resolve, 60000))
            // console.log('1 minute elapsed, stopping bot...')
            // await this.stop()
        } catch (error) {
            console.error('Failed to start grid bot:', error)
            await this.stop()
            process.exit(1)
        }
    }

    async stop() {
        this.isShuttingDown = true
        console.log('Initiating graceful shutdown...')

        try {
            this.wsClient.closeAll()

            const orders = await this.exchange.cancelAllOrders(this.pairName)
            console.log(`Successfully cancelled ${orders.length} orders`)
            
            // Sell all base assets at market price
            const [baseAsset] = this.pairName.split('/')
            const balance = await this.exchange.fetchBalance()
            const baseBalance = balance[baseAsset]?.free
            
            if (baseBalance && baseBalance > 0) {
                console.log(`Selling remaining ${baseBalance} ${baseAsset} at market price`)
                await this.exchange.createMarketSellOrder(this.pairName, baseBalance)
                console.log(`Successfully sold ${baseBalance} ${baseAsset}`)
            }
        } catch (error) {
            console.error(`Error cancelling orders: `, error)
        }

        console.log('Grid bot stopped successfully')
    }
}

module.exports = {
    SpotGridBot
}