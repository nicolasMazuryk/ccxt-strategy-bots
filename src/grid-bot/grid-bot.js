import ccxt from 'ccxt';
import {
    WebsocketClient,
    DefaultLogger,
    isWsFormattedSpotUserDataExecutionReport,
    isWsFormattedFuturesUserDataEvent,
    isWsFormattedFuturesUserDataTradeUpdateEvent,
} from 'binance';

import chalk from 'chalk';
import logger from '../utils/logger.js';
import { formatNumberWithPrecision } from '../utils/utils.js';

class GridBot {
    constructor({
        pairName,
        lowerPrice,
        upperPrice,
        gridStep,
        quantityPerGrid,
        pricePrecision,
        apiKey,
        apiSecret,
        marketType,
        isInfiniteGrid, 
    }) {
        this.pairName = pairName
        this.lowerPrice = lowerPrice
        this.upperPrice = upperPrice
        this.gridStep = gridStep
        this.quantityPerGrid = quantityPerGrid
        this.pricePrecision = pricePrecision
        this.marketType = marketType
        this.isInfiniteGrid = isInfiniteGrid
        this.toPrecision = formatNumberWithPrecision(pricePrecision)

        this.gridLevels = []

        this.gridInitializationBestAskPrice = 0

        this.isProcessingOrderbookBestBidAskUpdateEvent = false
        this.isShuttingDown = false

        logger.info(chalk.cyan(`Initializing ${marketType.toUpperCase()} Grid Bot for ${chalk.bold(pairName)}`))
        logger.info(chalk.cyan('Grid Parameters:'))
        logger.info(chalk.cyan(`- Price Range: ${chalk.yellow(lowerPrice)} to ${chalk.yellow(upperPrice)}`))
        logger.info(chalk.cyan(`- Grid Step: ${chalk.yellow(gridStep)}`))
        logger.info(chalk.cyan(`- Quantity Per Grid: ${chalk.yellow(quantityPerGrid)}`))
        logger.info(chalk.cyan(`- Infinite Grid Mode: ${isInfiniteGrid ? chalk.green('Enabled') : chalk.red('Disabled')}`))

        this.wsClient = new WebsocketClient(
            {
              api_key: apiKey,
              api_secret: apiSecret,
              beautify: true,
              logger: DefaultLogger
            },
        )

        const exchange = this.marketType === 'spot' ? ccxt.binance : ccxt.binanceusdm

        this.exchange = new exchange({
            apiKey: apiKey,
            secret: apiSecret,
        })

        this.exchange.options['maxRetriesOnFailure'] = 300
        this.exchange.options['maxRetriesOnFailureDelay'] = 2000
        
        logger.info(chalk.green('Exchange connection initialized'))
    }

    generateGridLevels() {
        const levels = []
        let currentPrice = this.lowerPrice
        
        while (currentPrice <= this.upperPrice) {
            levels.push(currentPrice)
            currentPrice = this.toPrecision(currentPrice + this.gridStep)
        }
        
        this.gridLevels = levels
        logger.info(chalk.cyan(`Generated ${chalk.yellow(levels.length)} grid levels`))
        return levels
    }

    calculateTotalCapital() {
        const totalCapital = this.gridLevels.reduce((sum, price) => {
            return sum + (price * this.quantityPerGrid)
        }, 0)

        const totalCapitalFormatted = Number(totalCapital).toFixed(2)

        logger.info(chalk.cyan(`Required capital for grid: ${chalk.yellow(totalCapitalFormatted)} USDT`))

        return totalCapitalFormatted
    }

    async initializeWebSocketHandlers() {
        this.wsClient.on('formattedMessage', (data) => {
            if (this.isShuttingDown) return

            if (this.marketType === 'spot') {
                if (isWsFormattedSpotUserDataExecutionReport(data)) {
                    return this.handleOrderUpdate(data)
                }
            }

            if (this.marketType === 'linear') {
                if (isWsFormattedFuturesUserDataTradeUpdateEvent(data)) {
                    return this.handleOrderUpdate(data.order)
                }
            }

            if (data.eventType === 'bookTicker') {
                return this.onOrderbookBestBidAskUpdateEvent(data)
            }
        })
        
        this.wsClient.on('open', (data) => {
            logger.info(chalk.green(`WebSocket connection opened: ${data.wsKey} - ${data.ws.target.url}`))
        })
        
        this.wsClient.on('reconnecting', (data) => {
            logger.warn(chalk.yellow(`WebSocket reconnecting... Channel: ${data?.wsKey}`))
        })
        
        this.wsClient.on('reconnected', (data) => {
            if (this.isShuttingDown) return

            if (
                typeof data?.wsKey === 'string' &&
                data.wsKey.toLowerCase().includes('userdata')
              ) {
                console.log(chalk.green('ws for user data stream has reconnected ', data?.wsKey))
              } else {
                logger.info(chalk.green(`WebSocket reconnected: ${data?.wsKey}`))
              }
        })
        
        this.wsClient.on('error', (data) => {
            logger.error(chalk.red(`WebSocket ERROR on channel ${data?.wsKey}`))
        })
    }

    async onOrderbookBestBidAskUpdateEvent(data) {
        if (this.isProcessingOrderbookBestBidAskUpdateEvent || this.isShuttingDown) return

        const askPrice = data.askPrice

        if (askPrice <= this.gridInitializationBestAskPrice) return

        this.isProcessingOrderbookBestBidAskUpdateEvent = true

        logger.info(chalk.cyan(`Market price update - New best ask: ${chalk.yellow(askPrice)}`))

        this.handleInfiniteGrid(askPrice)

        for (const level of this.gridLevels) {
            if (level < askPrice && level >= this.gridInitializationBestAskPrice) {
                logger.info(chalk.cyan(`New grid level: ${chalk.yellow(level)}`))
                await this.placeBuyOrder(level)
            }
        }

        this.gridInitializationBestAskPrice = askPrice
        this.isProcessingOrderbookBestBidAskUpdateEvent = false
    }

    handleInfiniteGrid(askPrice) {
        if (this.isInfiniteGrid && askPrice > this.upperPrice) {
            logger.info(chalk.yellow('Price exceeded upper boundary, adjusting infinite grid...'))
            
            while (askPrice > this.upperPrice) {
                const lowestLevel = this.gridLevels.shift()
                logger.info(chalk.yellow(`Removing lowest grid level: ${lowestLevel}`))

                const newHighestLevel = this.toPrecision(this.gridLevels[this.gridLevels.length - 1] + this.gridStep)
                this.gridLevels.push(newHighestLevel)
                logger.info(chalk.yellow(`Adding new highest grid level: ${newHighestLevel}`))

                this.lowerPrice = this.gridLevels[0]
                this.upperPrice = newHighestLevel
                
                logger.info(chalk.yellow(`New grid boundaries: ${this.lowerPrice} - ${this.upperPrice}`))
            }
        }
    }

    async handleOrderUpdate(order) {
        const orderStatus = order.orderStatus
        const side = order.side || order.orderSide
        const price = order.price || order.originalPrice
        
        if (orderStatus === 'FILLED') {
            logger.info(chalk.green(`Order filled - ${side} @ ${price}`))

            if (side === 'BUY') {
                const sellPrice = this.toPrecision(parseFloat(price) + this.gridStep)
                logger.info(chalk.cyan(`Placing corresponding SELL order @ ${chalk.yellow(sellPrice)}`))
                await this.placeSellOrder(sellPrice)
            } else {
                const buyPrice = this.toPrecision(parseFloat(price) - this.gridStep)
                logger.info(chalk.cyan(`Placing corresponding BUY order @ ${chalk.yellow(buyPrice)}`))
                await this.placeBuyOrder(buyPrice)
            }
        }
    }

    async placeBuyOrder(price) {
        try {
            const order = await this.exchange.createLimitBuyOrder(this.pairName, this.quantityPerGrid, price)
            logger.info(chalk.green(`Successfully placed BUY order @ ${price}`))
            return order
        } catch (error) {
            logger.error(chalk.red(`Failed to place BUY order @ ${price}: ${error.message}`))
        }
    }

    async placeSellOrder(price) {
        try {
            const order = await this.exchange.createLimitSellOrder(this.pairName, this.quantityPerGrid, price)
            logger.info(chalk.green(`Successfully placed SELL order: ${this.quantityPerGrid} @ ${price}`))
            return order
        } catch (error) {
            logger.error(chalk.red(`Failed to place SELL order @ ${price}: ${error.message}`))
        }
    }

    async initializeGrid() {
        try {
            logger.info(chalk.cyan('====== Initializing grid ======'))
            
            this.generateGridLevels()
            const totalCapital = this.calculateTotalCapital()

            await this.initializeWebSocketHandlers()
            
            if (this.marketType === 'spot') {
                logger.info(chalk.cyan('Subscribing to spot user data stream...'))
                await this.wsClient.subscribeSpotUserDataStream()
            }
            if (this.marketType === 'linear') {
                logger.info(chalk.cyan('Subscribing to USDM futures user data stream...'))
                await this.wsClient.subscribeUsdFuturesUserDataStream()
            }

            const orderbook = await this.exchange.fetchOrderBook(this.pairName)
            this.gridInitializationBestAskPrice = orderbook.asks[0][0]

            logger.info(chalk.cyan(`Current market price (best ask): ${chalk.yellow(this.gridInitializationBestAskPrice)}`))
            logger.info(chalk.cyan('Placing initial grid orders...'))

            for (const level of this.gridLevels) {
                if (level < this.gridInitializationBestAskPrice) {
                    await this.placeBuyOrder(level)
                }
            }

            if (this.marketType === 'spot') {
                logger.info(chalk.cyan('Subscribing to spot book ticker...'))
                this.wsClient.subscribeSymbolBookTicker(this.pairName.replace('/', ''), 'spot')
            }
            if (this.marketType === 'linear') {
                logger.info(chalk.cyan('Subscribing to futures book ticker...'))
                this.wsClient.subscribeSymbolBookTicker(this.pairName.replace('/', ''), 'usdm')
            }

            logger.info(chalk.green('====== Grid initialization complete ======'))

        } catch (error) {
            logger.error(chalk.red(`Grid initialization failed: ${error.message}`))
            throw error
        }
    }

    async start() {
        logger.info(chalk.cyan('='.repeat(50)))
        logger.info(chalk.cyan('Starting Grid Bot'))
        logger.info(chalk.cyan('='.repeat(50)))

        try {
            await this.initializeGrid()
        } catch (error) {
            logger.error(chalk.red(`Fatal error during startup: ${error.message}`))
            await this.stop()
            process.exit(1)
        }
    }

    async stop() {
        this.isShuttingDown = true
        logger.info(chalk.yellow('='.repeat(50)))
        logger.info(chalk.yellow('Initiating graceful shutdown'))
        logger.info(chalk.yellow('='.repeat(50)))

        try {
            logger.info(chalk.yellow('Closing WebSocket connections...'))
            this.wsClient.closeAll()

            logger.info(chalk.yellow('Cancelling all open orders...'))
            const orders = await this.exchange.cancelAllOrders(this.pairName)
            logger.info(chalk.green(`Successfully cancelled ${orders.length} orders`))
            
            const [baseAsset] = this.pairName.split('/')
            const balance = await this.exchange.fetchBalance()
            const baseBalance = balance[baseAsset]?.free
            
            if (baseBalance && baseBalance > 0) {
                logger.info(chalk.yellow(`Selling remaining ${baseBalance} ${baseAsset} at market price...`))
                await this.exchange.createMarketSellOrder(this.pairName, baseBalance)
                logger.info(chalk.green(`Successfully sold ${baseBalance} ${baseAsset}`))
            }

            logger.info(chalk.green('Shutdown complete'))
        } catch (error) {
            logger.error(chalk.red(`Error during shutdown: ${error.message}`))
        }
    }
}

export { GridBot }