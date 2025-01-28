import logger from '../utils/logger.js'
import chalk from 'chalk'
import { formatNumberWithPrecision, wait } from '../utils/utils.js'

class GridBot {
    constructor({
        pairName,
        lowerPrice,
        upperPrice,
        gridStep,
        quantityPerGrid,
        pricePrecision,
        isInfiniteGrid,
        stopLoss,
        takeProfit,
        leverage,
        exchange,
        isBacktest = false,
    }) {
        this.pairName = pairName
        this.lowerPrice = lowerPrice
        this.upperPrice = upperPrice
        this.gridStep = gridStep
        this.quantityPerGrid = quantityPerGrid
        this.pricePrecision = pricePrecision
        this.isInfiniteGrid = isInfiniteGrid
        this.toPrecision = formatNumberWithPrecision(pricePrecision)

        this.exchange = exchange

        this.gridLevels = []
        this.gridInitializationBestAskPrice = 0
        this.isProcessingOrderbookBestBidAskUpdateEvent = false
        this.isShuttingDown = false

        this.isBacktest = isBacktest

        this.stopLoss = stopLoss
        this.takeProfit = takeProfit
        this.leverage = leverage

        logger.info(chalk.cyan(`Initializing ${this.exchange.marketType.toUpperCase()} Grid Bot for ${chalk.bold(pairName)}`))
        logger.info(chalk.cyan('Grid Parameters:'))
        logger.info(chalk.cyan(`- Price Range: ${chalk.yellow(lowerPrice)} to ${chalk.yellow(upperPrice)}`))
        logger.info(chalk.cyan(`- Grid Step: ${chalk.yellow(gridStep)}`))
        logger.info(chalk.cyan(`- Quantity Per Grid: ${chalk.yellow(quantityPerGrid)}`))
        logger.info(chalk.cyan(`- Infinite Grid Mode: ${isInfiniteGrid ? chalk.green('Enabled') : chalk.red('Disabled')}`))

        logger.info(chalk.cyan(`- Stop Loss: ${stopLoss ? chalk.yellow(stopLoss) : chalk.red('Disabled')}`))
        logger.info(chalk.cyan(`- Take Profit: ${takeProfit ? chalk.yellow(takeProfit) : chalk.red('Disabled')}`))
    }

    generateGridLevels() {
        const levels = []
        let currentPrice = this.lowerPrice
        
        while (currentPrice < this.upperPrice) {
            levels.push(currentPrice)
            currentPrice = this.toPrecision(currentPrice + this.gridStep)
        }
        
        this.gridLevels = levels
        logger.info(chalk.cyan(`Generated ${chalk.yellow(levels.length)} grid levels`))
        return levels
    }

    calculateCapitalAndQuantityTotals() {
        const totalQuantity = this.gridLevels.length * this.quantityPerGrid

        const totalCapital = this.gridLevels.reduce((sum, price) => {
            return sum + (price * this.quantityPerGrid)
        }, 0)

        const totalMargin = this.exchange.marketType === 'linear' 
            ? totalCapital / this.leverage 
            : totalCapital

        logger.info(chalk.cyan(`Total capital needed: ${chalk.yellow(Number(totalCapital).toFixed(2))} USDT`))
        logger.info(chalk.cyan(`Required margin: ${chalk.yellow(Number(totalMargin).toFixed(2))} USDT`))
        logger.info(chalk.cyan(`Total base quantity: ${chalk.yellow(Number(totalQuantity).toFixed(2))}`))

        return { totalCapital, totalQuantity, totalMargin }
    }

    async handleOrderUpdate(order) {
        if (this.isShuttingDown) return

        const orderStatus = order.orderStatus
        const orderType = order.orderType || order.type
        const side = order.side || order.orderSide
        const price = order.price || order.originalPrice
        
        if (!this.isBacktest) await this.checkStopLossAndTakeProfitOrder(order)

        if (orderStatus === 'FILLED' && orderType === 'LIMIT') {
            logger.debug(chalk.green(`Order filled - ${side} @ ${price}`))

            if (side === 'BUY') {
                const sellPrice = this.toPrecision(parseFloat(price) + this.gridStep)
                logger.debug(chalk.cyan(`Placing corresponding SELL order @ ${chalk.yellow(sellPrice)}`))
                if (this.isBacktest) this.placeSellOrder(sellPrice)
                if (!this.isBacktest) await this.placeSellOrder(sellPrice)
            } else {
                const buyPrice = this.toPrecision(parseFloat(price) - this.gridStep)
                logger.debug(chalk.cyan(`Placing corresponding BUY order @ ${chalk.yellow(buyPrice)}`))
                if (this.isBacktest) this.placeBuyOrder(buyPrice)
                if (!this.isBacktest) await this.placeBuyOrder(buyPrice)
            }
        }
    }

    async onOrderbookBestBidAskUpdateEvent(data) {
        if (this.isProcessingOrderbookBestBidAskUpdateEvent || this.isShuttingDown) return

        const askPrice = data.askPrice

        if (!this.isBacktest) await this.checkStopLossAndTakeProfitLevels(askPrice)

        if (askPrice <= this.gridInitializationBestAskPrice) return

        this.isProcessingOrderbookBestBidAskUpdateEvent = true

        logger.debug(chalk.cyan(`Market price update - New best ask: ${chalk.yellow(askPrice)}`))

        if (this.isBacktest) this.handleInfiniteGrid(askPrice)
        if (!this.isBacktest) await this.handleInfiniteGrid(askPrice)

        for (const level of this.gridLevels) {
            if (level < askPrice && level >= this.gridInitializationBestAskPrice) {
                logger.debug(chalk.cyan(`New grid level: ${chalk.yellow(level)}`))
                if (this.isBacktest) this.placeBuyOrder(level)
                if (!this.isBacktest) await this.placeBuyOrder(level)
            }
        }

        this.gridInitializationBestAskPrice = askPrice
        this.isProcessingOrderbookBestBidAskUpdateEvent = false
    }

    async handleInfiniteGrid(askPrice) {
        if (this.isInfiniteGrid && askPrice > this.upperPrice) {
            logger.debug(chalk.yellow('Price exceeded upper boundary, adjusting infinite grid...'))
            
            while (askPrice > this.upperPrice) {
                const lowestLevel = this.gridLevels.shift()
                logger.debug(chalk.yellow(`Removing lowest grid level: ${lowestLevel}`))

                const canceledOrders = this.isBacktest ? 
                this.exchange.cancelOrdersBelowPrice(this.pairName, lowestLevel) : 
                await this.exchange.cancelOrdersBelowPrice(this.pairName, lowestLevel)

                if (canceledOrders.length > 0) logger.debug(chalk.cyan(`Canceled ${canceledOrders.length} orders below price: ${lowestLevel}`))

                const newHighestLevel = this.toPrecision(this.gridLevels[this.gridLevels.length - 1] + this.gridStep)
                this.gridLevels.push(newHighestLevel)
                logger.debug(chalk.yellow(`Adding new highest grid level: ${newHighestLevel}`))

                this.lowerPrice = this.gridLevels[0]
                this.upperPrice = newHighestLevel
                
                logger.debug(chalk.yellow(`New grid boundaries: ${this.lowerPrice} - ${this.upperPrice}`))
            }
        }
    }

    async placeBuyOrder(price) {
        try {
            const order = this.isBacktest
                ? this.exchange.createLimitBuyOrder(this.pairName, this.quantityPerGrid, price)
                : await this.exchange.createLimitBuyOrder(this.pairName, this.quantityPerGrid, price)
            
            logger.debug(chalk.green(`Successfully placed BUY order @ ${price}`))
            return order
        } catch (error) {
            logger.error(chalk.red(`Failed to place BUY order @ ${price}: ${error.message}`))
        }
    }

    async placeSellOrder(price) {
        try {
            const order = this.isBacktest
                ? this.exchange.createLimitSellOrder(this.pairName, this.quantityPerGrid, price)
                : await this.exchange.createLimitSellOrder(this.pairName, this.quantityPerGrid, price)
            
            logger.debug(chalk.green(`Successfully placed SELL order: ${this.quantityPerGrid} @ ${price}`))
            return order
        } catch (error) {
            logger.error(chalk.red(`Failed to place SELL order @ ${price}: ${error.message}`))
        }
    }

    async checkStopLossAndTakeProfitOrder(order) {
        const orderType = order.type || order.orderType
        const orderStatus = order.orderStatus

        if (orderStatus === 'FILLED' || orderStatus === 'EXPIRED') {

            if (['STOP', 'STOP_MARKET', 'STOP_LIMIT', 'STOP_LOSS', 'STOP_LOSS_MARKET', 'STOP_LOSS_LIMIT', 'TAKE_PROFIT', 'TAKE_PROFIT_MARKET', 'TAKE_PROFIT_LIMIT'].includes(orderType)) {
                // TO-DO:change to warning once tested
                logger.error(chalk.yellow(`[EXIT] ${orderType} order ${orderStatus} at price ${order.stopPrice}. Stopping bot...`))
                await this.stop()
            }
        }
    }

    async checkStopLossAndTakeProfitLevels(price) {
        if (this.stopLoss && price <= this.stopLoss) {
            // TO-DO:change to warning once tested
            logger.error(chalk.yellow(`[EXIT] Price ${price} hit STOP-LOSS level ${this.stopLoss}. Stopping bot...`))
            await this.stop()
        }

        if (this.takeProfit && price >= this.takeProfit) {
            // TO-DO:change to warning once tested
            logger.error(chalk.yellow(`[EXIT] Price ${price} reached TAKE-PROFIT level ${this.takeProfit}. Stopping bot...`))
            await this.stop()
        }
    }

    async initializeGrid() {
        try {
            logger.info(chalk.cyan('====== Initializing grid ======'))

            if (this.exchange.marketType === 'linear') {
                await this.exchange.setLeverage(this.pairName.replace('/', ''), this.leverage)
                logger.info(chalk.cyan(`Leverage set to ${this.leverage}x`))
            }

            this.generateGridLevels()

            const { totalCapital, totalQuantity } = this.calculateCapitalAndQuantityTotals()

            await this.exchange.initializeWebSocket()
            await this.exchange.subscribeToUserData()

            if (!this.isBacktest) await wait(1000)

            this.exchange.onOrderUpdate = this.handleOrderUpdate.bind(this)
            this.exchange.onPriceUpdate = this.onOrderbookBestBidAskUpdateEvent.bind(this)

            const orderbook = await this.exchange.fetchOrderBook(this.pairName)
            this.gridInitializationBestAskPrice = orderbook.asks[0][0]

            logger.info(chalk.cyan(`Current ${this.pairName} market price (best ask): ${chalk.yellow(this.gridInitializationBestAskPrice)}`))
            logger.info(chalk.cyan('Placing initial grid orders...'))

            for (const level of this.gridLevels) {
                if (level < this.gridInitializationBestAskPrice) {
                    await this.placeBuyOrder(level)
                }
            }

            if (!this.isBacktest && this.exchange.marketType === 'linear') {
                if (this.stopLoss) await this.exchange.createStopLossOrder(this.pairName, 'SELL', totalQuantity, this.stopLoss)
                if (this.takeProfit) await this.exchange.createTakeProfitOrder(this.pairName, 'SELL', totalQuantity, this.takeProfit)
            }

            await this.exchange.subscribeToBookTicker(this.pairName)
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
        if (this.isShuttingDown) return
        this.isShuttingDown = true

        logger.info(chalk.yellow('='.repeat(50)))
        logger.info(chalk.yellow('Initiating graceful shutdown'))
        logger.info(chalk.yellow('='.repeat(50)))

        try {
            logger.info(chalk.yellow('Closing WebSocket connections...'))
            this.exchange.closeAll()

            logger.info(chalk.yellow('Cancelling all open orders...'))
            const orders = await this.exchange.cancelAllOrders(this.pairName)
            logger.info(chalk.green(`Successfully cancelled ${this.exchange.marketType === 'spot' ? orders.length : 'all'} orders`))
            
            const [baseAsset] = this.pairName.split('/')
            const balance = await this.exchange.fetchBalance()

            if (this.exchange.marketType === 'spot') {
                const baseBalance = balance[baseAsset]?.free
                if (baseBalance && baseBalance > 0) {
                    logger.info(chalk.yellow(`Selling remaining ${baseBalance} ${baseAsset} at market price...`))
                    const exitOrder = await this.exchange.createMarketSellOrder(this.pairName, baseBalance)
                    logger.info(chalk.green(`Successfully sold ${exitOrder.filled} ${baseAsset} at ${exitOrder.average}`))
                }
            } else if (this.exchange.marketType === 'linear') {
                const positions = balance.info.positions
                const position = positions.find(p => p.symbol === this.pairName.replace('/', ''))
                const positionAmount = parseFloat(position?.positionAmt || 0)
                
                if (position && positionAmount !== 0) {
                    logger.info(chalk.yellow(`Closing futures position of ${positionAmount} ${baseAsset}...`))
                    const exitOrder = positionAmount > 0 ? 
                        await this.exchange.createMarketSellOrder(this.pairName, Math.abs(positionAmount), { reduceOnly: true }) : 
                        await this.exchange.createMarketBuyOrder(this.pairName, Math.abs(positionAmount), { reduceOnly: true })
                    logger.info(chalk.green(`Successfully closed futures position of ${exitOrder.filled} ${baseAsset} at ${exitOrder.average}`))
                }
            }

            logger.info(chalk.yellow('='.repeat(50)))
            logger.info(chalk.yellow('Graceful shutdown complete'))
            logger.info(chalk.yellow('='.repeat(50)))

            process.exit(0)
        } catch (error) {
            logger.error(chalk.red(`Error during shutdown: ${error.message}`))
        }
    }
}

export default GridBot