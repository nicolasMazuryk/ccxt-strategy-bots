import logger from '../utils/logger.js'
import chalk from 'chalk'
import { formatNumberWithPrecision, wait } from '../utils/utils.js'

class WickBot {
    constructor({
        pairName,
        quantity,
        pricePrecision,
        leverage,
        exchange,
        isHedgeMode = false,
        isBacktest = false,
        // Wick bot specific parameters
        maxHistoricalCandleLookback = 100,
        minHistoricalCandleLookback = 0,
        minHistoricalWickSize = 0.5, // percentage
        minCurrentWickSize = 0.3, // percentage
    }) {
        this.pairName = pairName
        this.quantity = quantity
        this.pricePrecision = pricePrecision
        this.toPrecision = formatNumberWithPrecision(pricePrecision)

        this.exchange = exchange

        this.isProcessingOrderbookBestBidAskUpdateEvent = false
        this.isShuttingDown = false

        this.isBacktest = isBacktest

        this.leverage = leverage
        this.isHedgeMode = isHedgeMode && this.exchange.marketType === 'linear'

        // Wick bot specific parameters
        this.maxHistoricalCandleLookback = maxHistoricalCandleLookback
        this.minHistoricalCandleLookback = minHistoricalCandleLookback
        this.minHistoricalWickSize = minHistoricalWickSize / 100 // convert to decimal
        this.minCurrentWickSize = minCurrentWickSize / 100 // convert to decimal

        // Wick bot state
        this.historicalWicks = [] // Array of {price, timestamp, used} objects
        this.currentCandle = null
        this.activePositions = [] // Array of {entryPrice, stopLoss, takeProfit, side} objects

        logger.info(chalk.cyan(`Initializing ${this.exchange.marketType.toUpperCase()} Wick Bot for ${chalk.bold(pairName)}`))
        logger.info(chalk.cyan(`- Hedge Mode: ${this.isHedgeMode ? chalk.green('Enabled') : chalk.red('Disabled')}`))
        logger.info(chalk.cyan(`- Leverage: ${this.leverage}x`))
        logger.info(chalk.cyan(`- Quantity: ${chalk.yellow(quantity)}`))
        logger.info(chalk.cyan(`- Max Historical Candle Lookback: ${this.maxHistoricalCandleLookback}`))
        logger.info(chalk.cyan(`- Min Historical Candle Lookback: ${this.minHistoricalCandleLookback}`))
        logger.info(chalk.cyan(`- Min Historical Wick Size: ${this.minHistoricalWickSize * 100}%`))
        logger.info(chalk.cyan(`- Min Current Wick Size: ${this.minCurrentWickSize * 100}%`))
    }

    async handleOrderUpdate(order) {
        if (this.isShuttingDown) return

        const orderStatus = order.orderStatus
        const orderType = order.orderType || order.type
        const side = order.side || order.orderSide
        const price = order.price || order.originalPrice
        
        if (orderStatus === 'FILLED') {
            logger.debug(chalk.green(`Order filled - ${side} @ ${price}`))
            
            // Update position tracking
            if (orderType === 'LIMIT' || orderType === 'MARKET') {
                // Find the corresponding position
                const positionIndex = this.activePositions.findIndex(p => 
                    (side === 'BUY' && p.side === 'LONG' && p.entryPrice === price) ||
                    (side === 'SELL' && p.side === 'SHORT' && p.entryPrice === price)
                )
                
                if (positionIndex !== -1) {
                    // Position was filled
                    logger.info(chalk.green(`Position ${side} filled at ${price}`))
                }
            } else if (orderType === 'STOP_MARKET' || orderType === 'TAKE_PROFIT_MARKET') {
                // Position was closed
                const positionIndex = this.activePositions.findIndex(p => 
                    (side === 'SELL' && p.side === 'LONG' && p.stopLoss === price) ||
                    (side === 'BUY' && p.side === 'SHORT' && p.stopLoss === price) ||
                    (side === 'SELL' && p.side === 'LONG' && p.takeProfit === price) ||
                    (side === 'BUY' && p.side === 'SHORT' && p.takeProfit === price)
                )
                
                if (positionIndex !== -1) {
                    // Remove the closed position
                    const closedPosition = this.activePositions.splice(positionIndex, 1)[0]
                    logger.info(chalk.yellow(`Position ${closedPosition.side} closed at ${price}`))
                }
            }
        }
    }

    async onOrderbookBestBidAskUpdateEvent(data) {
        if (this.isProcessingOrderbookBestBidAskUpdateEvent || this.isShuttingDown) return

        const askPrice = data.askPrice
        const bidPrice = data.bidPrice
        const currentPrice = (askPrice + bidPrice) / 2

        this.isProcessingOrderbookBestBidAskUpdateEvent = true

        logger.debug(chalk.cyan(`Market price update: ${chalk.yellow(currentPrice)}`))

        // Process the current candle
        await this.processCurrentCandle(currentPrice)

        this.isProcessingOrderbookBestBidAskUpdateEvent = false
    }

    async processCurrentCandle(currentPrice) {
        // If we don't have a current candle yet, create one
        if (!this.currentCandle) {
            this.currentCandle = {
                open: currentPrice,
                high: currentPrice,
                low: currentPrice,
                close: currentPrice,
                timestamp: Date.now()
            }
            return
        }

        // Update the current candle
        this.currentCandle.high = Math.max(this.currentCandle.high, currentPrice)
        this.currentCandle.low = Math.min(this.currentCandle.low, currentPrice)
        this.currentCandle.close = currentPrice

        // Check for entry conditions
        await this.checkEntryConditions()
    }

    async checkEntryConditions() {
        if (!this.currentCandle) return

        // For LONG positions
        await this.checkLongEntryConditions()

        // For SHORT positions
        await this.checkShortEntryConditions()
    }

    async checkLongEntryConditions() {
        // Find historical wick-downs at local lows
        const historicalWicks = this.findHistoricalWickDowns()
        
        // Check if any historical wick is triggered
        for (const wick of historicalWicks) {
            if (wick.used) continue // Skip already used wicks
            
            const wickEndPrice = wick.price
            
            // Check if price dropped below the wick end and then reversed back up
            if (this.currentCandle.low < wickEndPrice && 
                this.currentCandle.close > wickEndPrice && 
                this.currentCandle.close < this.currentCandle.open) {
                
                // Calculate the wick size as a percentage
                const wickSize = (wickEndPrice - this.currentCandle.low) / this.currentCandle.low * 100
                
                // Check if the wick size meets the minimum requirement
                if (wickSize >= this.minCurrentWickSize * 100) {
                    // Entry condition met for LONG position
                    await this.openLongPosition(wickEndPrice)
                    
                    // Mark the wick as used
                    wick.used = true
                    break
                }
            }
        }
    }

    async checkShortEntryConditions() {
        // Find historical wick-ups at local highs
        const historicalWicks = this.findHistoricalWickUps()
        
        // Check if any historical wick is triggered
        for (const wick of historicalWicks) {
            if (wick.used) continue // Skip already used wicks
            
            const wickEndPrice = wick.price
            
            // Check if price rose above the wick end and then reversed back down
            if (this.currentCandle.high > wickEndPrice && 
                this.currentCandle.close < wickEndPrice && 
                this.currentCandle.close > this.currentCandle.open) {
                
                // Calculate the wick size as a percentage
                const wickSize = (this.currentCandle.high - wickEndPrice) / wickEndPrice * 100
                
                // Check if the wick size meets the minimum requirement
                if (wickSize >= this.minCurrentWickSize * 100) {
                    // Entry condition met for SHORT position
                    await this.openShortPosition(wickEndPrice)
                    
                    // Mark the wick as used
                    wick.used = true
                    break
                }
            }
        }
    }

    findHistoricalWickDowns() {
        // This would be implemented to fetch historical candles and find wick-downs
        // For now, we'll use a placeholder implementation
        return this.historicalWicks.filter(wick => !wick.isWickUp)
    }

    findHistoricalWickUps() {
        // This would be implemented to fetch historical candles and find wick-ups
        // For now, we'll use a placeholder implementation
        return this.historicalWicks.filter(wick => wick.isWickUp)
    }

    async openLongPosition(entryPrice) {
        // Calculate stop loss at the low of the current candle
        const stopLoss = this.currentCandle.low
        
        // Calculate take profit at 2:1 risk/reward ratio
        const risk = entryPrice - stopLoss
        const takeProfit = entryPrice + (risk * 2)
        
        // Place the orders
        await this.placeBuyOrder(entryPrice)
        await this.placeStopLossOrder(stopLoss, 'LONG')
        await this.placeTakeProfitOrder(takeProfit, 'LONG')
        
        // Track the position
        this.activePositions.push({
            entryPrice,
            stopLoss,
            takeProfit,
            side: 'LONG'
        })
        
        logger.info(chalk.green(`Opened LONG position at ${entryPrice}, SL: ${stopLoss}, TP: ${takeProfit}`))
    }

    async openShortPosition(entryPrice) {
        // Calculate stop loss at the high of the current candle
        const stopLoss = this.currentCandle.high
        
        // Calculate take profit at 2:1 risk/reward ratio
        const risk = stopLoss - entryPrice
        const takeProfit = entryPrice - (risk * 2)
        
        // Place the orders
        await this.placeSellOrder(entryPrice)
        await this.placeStopLossOrder(stopLoss, 'SHORT')
        await this.placeTakeProfitOrder(takeProfit, 'SHORT')
        
        // Track the position
        this.activePositions.push({
            entryPrice,
            stopLoss,
            takeProfit,
            side: 'SHORT'
        })
        
        logger.info(chalk.green(`Opened SHORT position at ${entryPrice}, SL: ${stopLoss}, TP: ${takeProfit}`))
    }

    async placeBuyOrder(price) {
        try {
            const params = this.isHedgeMode || this.isBacktest ? { positionSide: 'LONG' } : {}
            const order = this.isBacktest
                ? this.exchange.createLimitBuyOrder(this.pairName, this.quantity, price, params)
                : await this.exchange.createLimitBuyOrder(this.pairName, this.quantity, price, params)
            
            logger.debug(chalk.green(`Successfully placed BUY order ${this.quantity} @ ${price}`))
            return order
        } catch (error) {
            logger.error(chalk.red(`Failed to place BUY order @ ${price}: ${error.message}`))
        }
    }

    async placeSellOrder(price) {
        try {
            const params = this.isHedgeMode || this.isBacktest ? { positionSide: 'LONG' } : {}
            const order = this.isBacktest
                ? this.exchange.createLimitSellOrder(this.pairName, this.quantity, price, params)
                : await this.exchange.createLimitSellOrder(this.pairName, this.quantity, price, params)
            
            logger.debug(chalk.green(`Successfully placed SELL order: ${this.quantity} @ ${price}`))
            return order
        } catch (error) {
            logger.error(chalk.red(`Failed to place SELL order @ ${price}: ${error.message}`))
        }
    }

    async placeStopLossOrder(price, side) {
        try {
            const params = this.isHedgeMode || this.isBacktest ? { positionSide: side } : {}
            const orderType = 'STOP_MARKET'
            const orderSide = side === 'LONG' ? 'SELL' : 'BUY'
            
            const order = this.isBacktest
                ? this.exchange.createStopMarketOrder(this.pairName, this.quantity, price, orderSide, params)
                : await this.exchange.createStopMarketOrder(this.pairName, this.quantity, price, orderSide, params)
            
            logger.debug(chalk.green(`Successfully placed STOP LOSS order ${this.quantity} @ ${price}`))
            return order
        } catch (error) {
            logger.error(chalk.red(`Failed to place STOP LOSS order @ ${price}: ${error.message}`))
        }
    }

    async placeTakeProfitOrder(price, side) {
        try {
            const params = this.isHedgeMode || this.isBacktest ? { positionSide: side } : {}
            const orderType = 'TAKE_PROFIT_MARKET'
            const orderSide = side === 'LONG' ? 'SELL' : 'BUY'
            
            const order = this.isBacktest
                ? this.exchange.createTakeProfitMarketOrder(this.pairName, this.quantity, price, orderSide, params)
                : await this.exchange.createTakeProfitMarketOrder(this.pairName, this.quantity, price, orderSide, params)
            
            logger.debug(chalk.green(`Successfully placed TAKE PROFIT order ${this.quantity} @ ${price}`))
            return order
        } catch (error) {
            logger.error(chalk.red(`Failed to place TAKE PROFIT order @ ${price}: ${error.message}`))
        }
    }

    async initializeWickBot() {
        try {
            logger.info(chalk.cyan('====== Initializing wick-bot ======'))

            if (this.exchange.marketType === 'linear') {
                await this.exchange.setHedgeMode(this.pairName, this.isHedgeMode)
                
                await this.exchange.setLeverage(this.pairName.replace('/', ''), this.leverage)
                logger.info(chalk.cyan(`Leverage set to ${this.leverage}x`))
            }

            // Fetch historical candles to identify wicks
            await this.fetchHistoricalCandles()

            await this.exchange.initializeWebSocket()
            await this.exchange.subscribeToUserData()

            if (!this.isBacktest) await wait(1000) // live 4000, backtest 1000

            this.exchange.onOrderUpdate = this.handleOrderUpdate.bind(this)
            this.exchange.onPriceUpdate = this.onOrderbookBestBidAskUpdateEvent.bind(this)

            await this.exchange.subscribeToBookTicker(this.pairName)
            logger.info(chalk.green('====== Wick-bot initialization complete ======'))

        } catch (error) {
            logger.error(chalk.red(`Wick-bot initialization failed: ${error.message}`))
            throw error
        }
    }

    async fetchHistoricalCandles() {
        try {
            // Fetch historical candles from the exchange
            const candles = await this.exchange.fetchOHLCV(this.pairName, '1h', this.maxHistoricalCandleLookback)
            
            // Process the candles to identify wicks
            this.processHistoricalCandles(candles)
            
            logger.info(chalk.green(`Fetched ${candles.length} historical candles`))
        } catch (error) {
            logger.error(chalk.red(`Failed to fetch historical candles: ${error.message}`))
        }
    }

    processHistoricalCandles(candles) {
        // Skip the most recent candles based on minHistoricalCandleLookback
        const startIndex = Math.min(this.minHistoricalCandleLookback, candles.length - 1)
        const endIndex = candles.length - 1
        
        // Process each candle to identify wicks
        for (let i = startIndex; i < endIndex; i++) {
            const candle = candles[i]
            const [timestamp, open, high, low, close] = candle
            
            // Calculate body size
            const bodySize = Math.abs(close - open)
            
            // Check for wick-down (lower wick)
            if (low < open && low < close) {
                const wickSize = (Math.min(open, close) - low) / low * 100
                
                if (wickSize >= this.minHistoricalWickSize * 100) {
                    this.historicalWicks.push({
                        price: low,
                        timestamp,
                        used: false,
                        isWickUp: false
                    })
                }
            }
            
            // Check for wick-up (upper wick)
            if (high > open && high > close) {
                const wickSize = (high - Math.max(open, close)) / Math.max(open, close) * 100
                
                if (wickSize >= this.minHistoricalWickSize * 100) {
                    this.historicalWicks.push({
                        price: high,
                        timestamp,
                        used: false,
                        isWickUp: true
                    })
                }
            }
        }
        
        logger.info(chalk.green(`Identified ${this.historicalWicks.length} historical wicks`))
    }

    async start() {
        logger.info(chalk.cyan('='.repeat(50)))
        logger.info(chalk.cyan('Starting Wick Bot'))
        logger.info(chalk.cyan('='.repeat(50)))

        try {
            await this.initializeWickBot()
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
                    const exitOrder = await this.exchange.createMarketSellOrder(this.pairName, baseBalance, { reduceOnly: true })
                    logger.info(chalk.green(`Successfully sold ${exitOrder.filled} ${baseAsset} at ${exitOrder.average}`))
                }
            } else if (this.exchange.marketType === 'linear') {
                const positions = balance.info.positions.filter(p => p.symbol === this.pairName.replace('/', ''))

                for (const position of positions) {
                    const positionAmount = parseFloat(position?.positionAmt || 0)
                    const positionSide = position?.positionSide

                    if (position && positionAmount !== 0) {
                        logger.info(chalk.yellow(`Closing futures ${positionSide} position of ${positionAmount} ${baseAsset}...`))

                        const params = this.isHedgeMode || this.isBacktest ? { positionSide: position?.positionSide } : { reduceOnly: true }

                        const exitOrder = positionAmount > 0 ? 
                            await this.exchange.createMarketSellOrder(this.pairName, Math.abs(positionAmount), params) :
                            await this.exchange.createMarketBuyOrder(this.pairName, Math.abs(positionAmount), params)
                        logger.info(chalk.green(`Successfully closed futures ${positionSide} position of ${exitOrder.filled} ${baseAsset} at ${exitOrder.average}`))
                    }
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

export default WickBot