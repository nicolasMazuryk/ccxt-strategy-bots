import logger from '../utils/logger.js'
import chalk from 'chalk'
import { getFundingRates } from '../funding-arbitrage/funding.js'
import { formatNumberWithPrecision, wait, getDecimals } from '../utils/utils.js'
import { CronJob } from 'cron'
import { shouldFilterError } from '../utils/error-filter.js'
import { removeBotFromGracefulShutdown } from '../utils/graceful-shotdown.js'

class FundingBot {
    constructor({
        config,
        exchange,
        fundingData,
        isBacktest = false,
    }) {
        this.config = config
        this.exchange = exchange
        this.fundingData = fundingData
        this.isBacktest = isBacktest

        // ********** INITIALIZATION **********
        // BINANCE
        // this.pairName = fundingData.symbol.replace(':USDT', '')
        // this.symbol = this.pairName.replace('/', '')
        // BYBIT
        this.pairName = fundingData.symbol
        this.symbol = this.pairName.replace(':USDT', '').replace('/', '')

        this.isPositiveFunding = this.fundingData.fundingRate > 0
        this.isNegativeFunding = this.fundingData.fundingRate < 0

        const symbolInfo = this.exchange.exchange.markets[fundingData.symbol]
        this.toPrecisionPrice = formatNumberWithPrecision(getDecimals(symbolInfo.precision.price))
        this.toPrecisionQuantity = formatNumberWithPrecision(getDecimals(symbolInfo.precision.amount))

        // ********** CRON JOBS **********
        this.fundingRateCron = null
        this.openFundingProfitDeltaIgnoredCron = null
        this.closeFundingProfitDeltaIgnoredCron = null
        this.openFundingIgnoredDeltaProfitCron = null
        this.closeFundingIgnoredDeltaProfitCron = null
        this.openFundingLossDeltaProfitCron = null
        this.closeFundingLossDeltaProfitCron = null

        // ********** ORDERBOOK **********
        this.orderBook = {
            askPrice: 0,
            bidPrice: 0,
            spread: 0
        }

        // ********** RISK MANAGEMENT **********
        this.quantity = 0

        // ********** OPEN POSITIONS **********
        this.isFundingProfitDeltaIgnoredPositionOpen = false
        this.isFundingIgnoredDeltaProfitPositionOpen = false
        this.isFundingLossDeltaProfitPositionOpen = false

        this.fundingProfitDeltaIgnoredOpenOrders = []
        this.fundingIgnoredDeltaProfitOpenOrders = []
        this.fundingLossDeltaProfitOpenOrders = []

        // ********** PROCESSING **********
        this.isProcessingOrderbookBestBidAskUpdateEvent = false
        this.isShuttingDown = false

        this.isFundingProfitDeltaIgnoredExecutionDone = false
        this.isFundingIgnoredDeltaProfitExecutionDone = false
        this.isFundingLossDeltaProfitExecutionDone = false

        logger.info(chalk.cyan(`[Bot ${this.pairName}] Initializing ${this.exchange.marketType.toUpperCase()} Funding Bot`))
        logger.info(chalk.cyan(`[Bot ${this.pairName}] - Leverage: ${this.config.leverage}x`))
        logger.info(chalk.cyan(`[Bot ${this.pairName}] - Amount: ${chalk.yellow(this.config.amount)}`))
    }

    createClientOrderId(strategyId) {
        const symbol = this.pairName.split('/')[0]
        const date = Date.now().toString().slice(4)
        const randomChars = Math.random().toString(36).substring(2, 6)
        const customOrderId = `${strategyId}_${symbol}_${date}_${randomChars}`

        const exchangeId = this.exchange.exchange.id
        
        const customOrderIdProperty = {
            'binance': 'clientOrderId',
            'binanceusdm': 'clientOrderId',
            'bybit': 'orderLinkId'
        }[exchangeId]

        return {
            [customOrderIdProperty]: customOrderId
        }
    }

    async handleOrderUpdate(order) {
        if (this.isShuttingDown) return

        const orderStatus = order.orderStatus
        const orderType = order.orderType || order.type
        const originalOrderType = order.originalOrderType
        const side = order.side || order.orderSide
        const positionSide = order.positionSide
        const quantity = order.filled || order.originalQuantity
        const price = order.averagePrice
        const [strategy] = order.clientOrderId.split('_')

        if (order.symbol !== this.symbol) return

        if (orderStatus === 'FILLED') {
            if (this.config.isFundingProfitDeltaIgnoredStrategy && strategy === 'P-I') {
                const isEntryLongPosition = positionSide === 'LONG' && side === 'BUY' && orderType === 'MARKET' && originalOrderType === 'MARKET'
                const isEntryShortPosition = positionSide === 'SHORT' && side === 'SELL' && orderType === 'MARKET' && originalOrderType === 'MARKET'
                const isEntryPosition = isEntryLongPosition || isEntryShortPosition

                const isStopLossOrTakeProfitLongPosition = positionSide === 'LONG' && side === 'SELL' && (orderType === 'MARKET' || orderType === 'LIMIT') && (originalOrderType === 'STOP_MARKET' || originalOrderType === 'TAKE_PROFIT_MARKET' || originalOrderType === 'LIMIT')
                const isStopLossOrTakeProfitShortPosition = positionSide === 'SHORT' && side === 'BUY' && (orderType === 'MARKET' || orderType === 'LIMIT') && (originalOrderType === 'STOP_MARKET' || originalOrderType === 'TAKE_PROFIT_MARKET' || originalOrderType === 'LIMIT')
                const isStopLossOrTakeProfitPosition = isStopLossOrTakeProfitLongPosition || isStopLossOrTakeProfitShortPosition

                const isHardCronExitLongPosition = positionSide === 'LONG' && side === 'SELL' && orderType === 'MARKET' && originalOrderType === 'MARKET'
                const isHardCronExitShortPosition = positionSide === 'SHORT' && side === 'BUY' && orderType === 'MARKET' && originalOrderType === 'MARKET'
                const isHardCronExitPosition = isHardCronExitLongPosition || isHardCronExitShortPosition

                const isExitPosition = isStopLossOrTakeProfitPosition || isHardCronExitPosition

                if (isEntryPosition) {
                    logger.debug(chalk.green(`[Bot ${this.pairName} (P-I)] Order FILLED - ${positionSide} ${side} ${originalOrderType}: ${quantity} @ ${price}`))
                    await this.handlePositionOpenFundingProfitDeltaIgnored(order)
                } else if (isExitPosition) {
                    logger.debug(chalk.green(`[Bot ${this.pairName} (P-I)] Order FILLED - ${positionSide} ${side} ${originalOrderType}: ${quantity} @ ${price}`))
                    await this.handlePositionCloseFundingProfitDeltaIgnored(order)
                }
            }

            if (this.config.isFundingIgnoredDeltaProfitStrategy && strategy === 'I-P') {
                const isEntryLongPosition = positionSide === 'LONG' && side === 'BUY' && orderType === 'MARKET' && (originalOrderType === 'STOP_MARKET' || originalOrderType === 'MARKET') // immediately triggered market order
                const isEntryShortPosition = positionSide === 'SHORT' && side === 'SELL' && orderType === 'MARKET' && (originalOrderType === 'STOP_MARKET' || originalOrderType === 'MARKET') // immediately triggered market order
                const isEntryPosition = isEntryLongPosition || isEntryShortPosition

                const isStopLossOrTakeProfitLongPosition = positionSide === 'LONG' && side === 'SELL' && (orderType === 'MARKET' || orderType === 'LIMIT') && (originalOrderType === 'STOP_MARKET' || originalOrderType === 'TAKE_PROFIT_MARKET' || originalOrderType === 'LIMIT')
                const isStopLossOrTakeProfitShortPosition = positionSide === 'SHORT' && side === 'BUY' && (orderType === 'MARKET' || orderType === 'LIMIT') && (originalOrderType === 'STOP_MARKET' || originalOrderType === 'TAKE_PROFIT_MARKET' || originalOrderType === 'LIMIT')
                const isStopLossOrTakeProfitPosition = isStopLossOrTakeProfitLongPosition || isStopLossOrTakeProfitShortPosition

                const isHardCronExitLongPosition = positionSide === 'LONG' && side === 'SELL' && orderType === 'MARKET' && originalOrderType === 'MARKET'
                const isHardCronExitShortPosition = positionSide === 'SHORT' && side === 'BUY' && orderType === 'MARKET' && originalOrderType === 'MARKET'
                const isHardCronExitPosition = isHardCronExitLongPosition || isHardCronExitShortPosition

                const isExitPosition = isStopLossOrTakeProfitPosition || isHardCronExitPosition

                if (isEntryPosition) {
                    logger.debug(chalk.green(`[Bot ${this.pairName} (I-P)] Order FILLED - ${positionSide} ${side} ${originalOrderType}: ${quantity} @ ${price}`))
                    await this.handlePositionOpenFundingIgnoredDeltaProfit(order)
                } else if (isExitPosition) {
                    logger.debug(chalk.green(`[Bot ${this.pairName} (I-P)] Order FILLED - ${positionSide} ${side} ${originalOrderType}: ${quantity} @ ${price}`))
                    await this.handlePositionCloseFundingIgnoredDeltaProfit(order)
                }
            }

            if (this.config.isFundingLossDeltaProfitStrategy && strategy === 'L-P') {
                const isEntryLongPosition = positionSide === 'LONG' && side === 'BUY' && orderType === 'MARKET' && originalOrderType === 'MARKET'
                const isEntryShortPosition = positionSide === 'SHORT' && side === 'SELL' && orderType === 'MARKET' && originalOrderType === 'MARKET'
                const isEntryPosition = isEntryLongPosition || isEntryShortPosition

                const isStopLossOrTakeProfitLongPosition = positionSide === 'LONG' && side === 'SELL' && (orderType === 'MARKET' || orderType === 'LIMIT') && (originalOrderType === 'STOP_MARKET' || originalOrderType === 'TAKE_PROFIT_MARKET' || originalOrderType === 'LIMIT')
                const isStopLossOrTakeProfitShortPosition = positionSide === 'SHORT' && side === 'BUY' && (orderType === 'MARKET' || orderType === 'LIMIT') && (originalOrderType === 'STOP_MARKET' || originalOrderType === 'TAKE_PROFIT_MARKET' || originalOrderType === 'LIMIT')
                const isStopLossOrTakeProfitPosition = isStopLossOrTakeProfitLongPosition || isStopLossOrTakeProfitShortPosition

                const isHardCronExitLongPosition = positionSide === 'LONG' && side === 'SELL' && orderType === 'MARKET' && originalOrderType === 'MARKET'
                const isHardCronExitShortPosition = positionSide === 'SHORT' && side === 'BUY' && orderType === 'MARKET' && originalOrderType === 'MARKET'
                const isHardCronExitPosition = isHardCronExitLongPosition || isHardCronExitShortPosition

                const isExitPosition = isStopLossOrTakeProfitPosition || isHardCronExitPosition

                if (isEntryPosition) {
                    logger.debug(chalk.green(`[Bot ${this.pairName} (L-P)] Order FILLED - ${positionSide} ${side} ${originalOrderType}: ${quantity} @ ${price}`))
                    await this.handlePositionOpenFundingLossDeltaProfit(order)
                } else if (isExitPosition) {
                    logger.debug(chalk.green(`[Bot ${this.pairName} (L-P)] Order FILLED - ${positionSide} ${side} ${originalOrderType}: ${quantity} @ ${price}`))
                    await this.handlePositionCloseFundingLossDeltaProfit(order)
                }
            }
        }
    }

    async onOrderbookBestBidAskUpdateEvent(data) {
        if (this.isProcessingOrderbookBestBidAskUpdateEvent || this.isShuttingDown) return

        this.isProcessingOrderbookBestBidAskUpdateEvent = true

        if (data.askPrice) this.orderBook.askPrice = data.askPrice
        if (data.bidPrice) this.orderBook.bidPrice = data.bidPrice
        this.orderBook.spread = ((this.orderBook.askPrice - this.orderBook.bidPrice) / this.orderBook.bidPrice) * 100

        // logger.debug(chalk.cyan('Market price update:'))
        // logger.debug(chalk.cyan(`Ask: ${chalk.yellow(askPrice)}`))
        // logger.debug(chalk.cyan(`Bid: ${chalk.yellow(bidPrice)}`))

        // if (Math.abs(spread - this.orderBook.spread) > 0.01) {
        //     logger.debug(chalk.cyan(`Spread ${this.pairName}: ${chalk.yellow(spread)}`))
        // }

        this.isProcessingOrderbookBestBidAskUpdateEvent = false
    }

    async initializeBot() {
        try {
            logger.info(chalk.cyan(`[Bot ${this.pairName}] ====== Initializing ${this.isPositiveFunding ? 'POSITIVE' : 'NEGATIVE'} funding-bot for ${this.pairName} ${this.fundingData.fundingRate * 100}% ======`))
            
            if (this.exchange.marketType === 'linear') {
                await this.exchange.setHedgeMode(this.pairName, this.config.isHedgeMode)

                await this.exchange.setLeverage(this.symbol, this.config.leverage)
                logger.info(chalk.cyan(`[Bot ${this.pairName}] Leverage set to ${this.config.leverage}x`))
            }

            await this.exchange.initializeWebSocket()
            await this.exchange.subscribeToUserData()

            if (!this.isBacktest) await wait(4000) // live 4000, backtest 1000

            this.exchange.onOrderUpdate = this.handleOrderUpdate.bind(this)
            this.exchange.onPriceUpdate = this.onOrderbookBestBidAskUpdateEvent.bind(this)

            await this.exchange.subscribeToBookTicker(this.pairName)

            if (!this.isBacktest) await wait(2000) // live 4000, backtest 1000

            logger.info(chalk.green(`[Bot ${this.pairName}] ====== Funding-bot initialization complete ======`))

        } catch (error) {
            logger.error(chalk.red(`[Bot ${this.pairName}] Funding-bot initialization failed: ${error.message}`))
            throw error
        }
    }

    async start() {
        logger.info(chalk.cyan(`[Bot ${this.pairName}]` + '='.repeat(50)))
        logger.info(chalk.cyan(`[Bot ${this.pairName}] Starting ${this.isPositiveFunding ? 'POSITIVE' : 'NEGATIVE'} Funding Bot`))
        logger.info(chalk.cyan(`[Bot ${this.pairName}]` + '='.repeat(50)))

        try {
            await this.initializeBot()
            
            this.startFundingRateCronJob()

            if (this.config.isFundingProfitDeltaIgnoredStrategy) {
                this.startFundingProfitDeltaIgnoredCronJob()
            }

            if (this.config.isFundingIgnoredDeltaProfitStrategy) {
                this.startFundingIgnoredDeltaProfitCronJob()
            }

            if (this.config.isFundingLossDeltaProfitStrategy) {
                this.startFundingLossDeltaProfitCronJob()
            }

        } catch (error) {
            logger.error(chalk.red(`[Bot ${this.pairName}] Fatal error during startup: ${error.message}`))
            await this.stop()
        }
    }

    startFundingRateCronJob() {
        this.fundingRateCron = new CronJob(
            '*/3 * * * * *',
            async () => {
                if (this.isShuttingDown) return
                try {
                    const fundingData = await this.exchange.fetchFundingRate(this.pairName)
                    this.fundingData = fundingData

                    if (this.isFundingProfitDeltaIgnoredPositionOpen || this.isFundingIgnoredDeltaProfitPositionOpen || this.isFundingLossDeltaProfitPositionOpen) return

                    this.isPositiveFunding = this.fundingData.fundingRate > 0
                    this.isNegativeFunding = this.fundingData.fundingRate < 0
                } catch (error) {
                    logger.error(chalk.red(`[Bot ${this.pairName}] Error fetching funding data: ${error.message}`))
                }
            },
            null,
            true,
            'utc'
        )
    }

    startFundingProfitDeltaIgnoredCronJob() {
        this.openFundingProfitDeltaIgnoredCron = new CronJob(
            '58 59 * * * *',
            // '58 * * * * *',
            async () => {
                if (this.isShuttingDown) return
                await this.openFundingProfitDeltaIgnoredPosition()
            },
            null,
            true,
            'utc'
        )

        this.closeFundingProfitDeltaIgnoredCron = new CronJob(
            '0 0 * * * *',
            // '30 * * * * *',
            async () => {
                if (this.isShuttingDown) return
                await this.closeFundingProfitDeltaIgnoredPosition()
            },
            null,
            true,
            'utc'
        )
    }

    startFundingIgnoredDeltaProfitCronJob() {
        this.openFundingIgnoredDeltaProfitCron = new CronJob(
            '58 59 * * * *',
            // '58 * * * * *',
            async () => {
                if (this.isShuttingDown) return
                await this.openFundingIgnoredDeltaProfitPosition()
            },
            null,
            true,
            'utc'
        )

        this.closeFundingIgnoredDeltaProfitCron = new CronJob(
            '0 3 * * * *',
            // '30 * * * * *',
            async () => {
                if (this.isShuttingDown) return
                await this.closeFundingIgnoredDeltaProfitPosition()
                // Cancel pending ENTRY STOP_MARKET order
                await this.handlePositionCloseFundingIgnoredDeltaProfit()
            },
            null,
            true,
            'utc'
        )
    }
    
    startFundingLossDeltaProfitCronJob() {
        this.openFundingLossDeltaProfitCron = new CronJob(
            '57 59 * * * *',
            // '58 * * * * *',
            async () => {
                if (this.isShuttingDown) return
                await this.openFundingLossDeltaProfitPosition()
            },
            null,
            true,
            'utc'
        )

        this.closeFundingLossDeltaProfitCron = new CronJob(
            '0 3 * * * *',
            // '30 * * * * *',
            async () => {
                if (this.isShuttingDown) return
                await this.closeFundingLossDeltaProfitPosition()
            },
            null,
            true,
            'utc'
        )
    }

    // ********** FUNDING PROFIT DELTA IGNORED STRATEGY **********

    async openFundingProfitDeltaIgnoredPosition() {
        if (this.isFundingProfitDeltaIgnoredPositionOpen) return

        try {
            const bestPrice = this.isPositiveFunding ? this.orderBook.bidPrice : this.orderBook.askPrice

            this.quantity = this.toPrecisionQuantity(this.config.amount / bestPrice)

            const fundingRate = Math.abs(this.fundingData.fundingRate)

            if (fundingRate < this.config.PI_MinFundingRate) {
                logger.info(chalk.red(`[Bot ${this.pairName} (P-I)] Funding rate is too low to open ${this.isPositiveFunding ? 'SHORT' : 'LONG'} position: ${this.fundingData.fundingRate}`))
                this.isFundingProfitDeltaIgnoredExecutionDone = true
                return
            }

            const entrySide = this.isPositiveFunding ? 'SELL' : 'BUY'
            const positionSide = this.isPositiveFunding ? 'SHORT' : 'LONG'
            const entryParams = this.config.isHedgeMode || this.isBacktest ? { positionSide } : {}

            const entryOrder = await this.exchange.createMarketOrder(
                this.pairName,
                entrySide,
                this.quantity,
                { ...entryParams, ...this.createClientOrderId('P-I') }
            )

            logger.info(chalk.green(`[Bot ${this.pairName} (P-I)] Placed ENTRY ${positionSide} ${entrySide} ${entryOrder.type?.toUpperCase()} order: FILLED ${entryOrder.filled} @ ${entryOrder.average}`))
        } catch (error) {
            logger.error(chalk.red(`[Bot ${this.pairName} (P-I)] Error placing ENTRY order: ${error.message}`))
        }
    }

    async closeFundingProfitDeltaIgnoredPosition() {
        if (!this.isFundingProfitDeltaIgnoredPositionOpen) return

        try {
            const exitSide = this.isPositiveFunding ? 'BUY' : 'SELL'
            const positionSide = this.isPositiveFunding ? 'SHORT' : 'LONG'
            const exitParams = this.config.isHedgeMode || this.isBacktest ? { positionSide } : { reduceOnly: true }

            const exitOrder = await this.exchange.createMarketOrder(
                this.pairName,
                exitSide,
                this.quantity,
                { ...exitParams, ...this.createClientOrderId('P-I'), reduceOnly: true }
            )
            
            logger.info(chalk.green(`[Bot ${this.pairName} (P-I)] Placed EXIT ${positionSide} ${exitSide} ${exitOrder.type?.toUpperCase()} order: FILLED ${exitOrder.filled} @ ${exitOrder.average}`))
        } catch (error) {
            if (shouldFilterError([-2022], error)) return
            logger.error(chalk.red(`[Bot ${this.pairName} (P-I)] Error placing EXIT order: ${error.message}`))
        }
    }

    async handlePositionOpenFundingProfitDeltaIgnored(order) {
        if (this.isFundingProfitDeltaIgnoredPositionOpen) return

        this.isFundingProfitDeltaIgnoredPositionOpen = true

        try {
            const positionSide = order.positionSide

            const stopLossMultiplier = positionSide === 'LONG' ? (1 - this.config.PI_StopLoss) : (1 + this.config.PI_StopLoss)
            const takeProfitMultiplier = positionSide === 'LONG' ? (1 + (this.config.commission + this.config.PI_Slippage)) : (1 - (this.config.commission + this.config.PI_Slippage))

            const stopLossPrice = this.toPrecisionPrice(order.averagePrice * stopLossMultiplier)
            const takeProfitPrice = this.toPrecisionPrice(order.averagePrice * takeProfitMultiplier)

            const exitSide = positionSide === 'LONG' ? 'SELL' :'BUY'
            const exitParams = this.config.isHedgeMode || this.isBacktest ? { positionSide } : { reduceOnly: true }
            const triggerDirection = positionSide === 'LONG' ? 2 : 1

            if (isNaN(this.quantity) || isNaN(stopLossPrice) || isNaN(takeProfitPrice) || this.quantity === 0 || stopLossPrice === 0 || takeProfitPrice === 0) {
                logger.error(chalk.red(`[Bot ${this.pairName} (P-I)] Invalid quantity or stop loss or take profit price: ${this.quantity} or ${stopLossPrice} or ${takeProfitPrice}`))
            }

            const [stopLossOrder, takeProfitOrder] = await Promise.all([
                this.exchange.createStopLossOrder(
                    this.pairName,
                    exitSide,
                    this.quantity,
                    stopLossPrice,
                    { 
                        ...exitParams, 
                        ...this.createClientOrderId('P-I'),
                        triggerDirection: triggerDirection,
                        reduceOnly: true,
                    }
                ),
                this.exchange.createLimitOrder(
                    this.pairName,
                    exitSide,
                    this.quantity,
                    takeProfitPrice,
                    { ...exitParams, ...this.createClientOrderId('P-I'), reduceOnly: true }
                )
            ])

            this.fundingProfitDeltaIgnoredOpenOrders.push(stopLossOrder, takeProfitOrder)
            
            logger.info(chalk.green(`[Bot ${this.pairName} (P-I)] Placed Stop-Loss ${positionSide} ${exitSide} ${stopLossOrder.type?.toUpperCase()} order: TRIGGER ${stopLossOrder.amount} @ ${stopLossOrder.triggerPrice}`))
            logger.info(chalk.green(`[Bot ${this.pairName} (P-I)] Placed Take-Profit ${positionSide} ${exitSide} ${takeProfitOrder.type?.toUpperCase()} order: LIMIT ${takeProfitOrder.amount} @ ${takeProfitOrder.price}`))
        } catch (error) {
            if (shouldFilterError([-2022], error)) return
            logger.error(chalk.red(`[Bot ${this.pairName} (P-I)] Error handling position open: ${error.message}`))
        }
    }

    async handlePositionCloseFundingProfitDeltaIgnored() {
        if (!this.isFundingProfitDeltaIgnoredPositionOpen) return
        try {
            logger.info(chalk.yellow(`[Bot ${this.pairName} (P-I)] Cancelling all open orders...`))

            const orderIds = this.fundingProfitDeltaIgnoredOpenOrders.map(order => order.id)

            if (orderIds.length > 0) {
                const orders = await this.exchange.cancelOrders(this.pairName, orderIds)

                logger.info(chalk.green(`[Bot ${this.pairName} (P-I)] Successfully cancelled ${orders.length} orders`))
            }

            this.isFundingProfitDeltaIgnoredPositionOpen = false
        } catch (error) {
            if (shouldFilterError([-2011], error)) return
            logger.error(chalk.red(`[Bot ${this.pairName} (P-I)] Error handling position close: ${error.message}`))
        } finally {
            this.isFundingProfitDeltaIgnoredExecutionDone = true
            await this.initiateShutdown()
        }
    }

    // ********** FUNDING IGNORED DELTA PROFIT STRATEGY **********

    async openFundingIgnoredDeltaProfitPosition() {
        if (this.isFundingIgnoredDeltaProfitPositionOpen) return

        try {
            const bestPrice = this.isPositiveFunding ? this.orderBook.askPrice : this.orderBook.bidPrice

            this.quantity = this.toPrecisionQuantity(this.config.amount / bestPrice)

            const fundingRate = Math.abs(this.fundingData.fundingRate)

            if (fundingRate < this.config.IP_MinFundingRate) {
                logger.info(chalk.red(`[Bot ${this.pairName} (I-P)] Funding rate is too low to open ${this.isPositiveFunding ? 'LONG' : 'SHORT'} position: ${this.fundingData.fundingRate}`))
                this.isFundingIgnoredDeltaProfitExecutionDone = true
                return
            }

            const entryPrice = this.isPositiveFunding ? 
                bestPrice * (1 + this.config.IP_BreakthroughOffset) : 
                bestPrice * (1 - this.config.IP_BreakthroughOffset)

            const entrySide = this.isPositiveFunding ? 'BUY' : 'SELL'
            const positionSide = this.isPositiveFunding ? 'LONG' : 'SHORT'
            const entryParams = this.config.isHedgeMode || this.isBacktest ? { positionSide } : {}
            const triggerDirection = positionSide === 'LONG' ? 1 : 2 // breakout direction

            const entryOrder = await this.exchange.createStopMarketOrder(
                this.pairName,
                entrySide,
                this.quantity,
                entryPrice,
                { 
                    ...entryParams, 
                    ...this.createClientOrderId('I-P'),
                    triggerDirection: triggerDirection,
                }
            )

            this.fundingIgnoredDeltaProfitOpenOrders.push(entryOrder)

            logger.info(chalk.green(`[Bot ${this.pairName} (I-P)] Placed ENTRY ${positionSide} ${entrySide} ${entryOrder.type?.toUpperCase()} order: TRIGGER ${entryOrder.amount} @ ${entryOrder.stopPrice}`))
        } catch (error) {
            logger.error(chalk.red(`[Bot ${this.pairName} (I-P)] Error placing ENTRY order: ${error.message}`))
        }
    }

    async closeFundingIgnoredDeltaProfitPosition() {
        if (!this.isFundingIgnoredDeltaProfitPositionOpen) return

        try {
            const exitSide = this.isPositiveFunding ? 'SELL' : 'BUY'
            const positionSide = this.isPositiveFunding ? 'LONG' : 'SHORT'
            const exitParams = this.config.isHedgeMode || this.isBacktest ? { positionSide } : { reduceOnly: true }

            const exitOrder = await this.exchange.createMarketOrder(
                this.pairName,
                exitSide,
                this.quantity,
                { ...exitParams, ...this.createClientOrderId('I-P'), reduceOnly: true }
            )
            
            logger.info(chalk.green(`[Bot ${this.pairName} (I-P)] Placed EXIT ${positionSide} ${exitSide} ${exitOrder.type?.toUpperCase()} order: FILLED ${exitOrder.filled} @ ${exitOrder.average}`))
        } catch (error) {
            if (shouldFilterError([-2022], error)) return
            logger.error(chalk.red(`[Bot ${this.pairName} (I-P)] Error placing EXIT order: ${error.message}`))
        }
    }

    async handlePositionOpenFundingIgnoredDeltaProfit(order) {
        if (this.isFundingIgnoredDeltaProfitPositionOpen) return

        this.isFundingIgnoredDeltaProfitPositionOpen = true

        try {
            const positionSide = order.positionSide

            // TODO: implement Trailing Stop Loss
            const takeProfitTarget = this.config.commission + this.config.IP_Slippage + this.config.IP_TargetProfit

            const stopLossMultiplier = positionSide === 'LONG' ? (1 - this.config.IP_StopLoss) : (1 + this.config.IP_StopLoss)
            const takeProfitMultiplier = positionSide === 'LONG' ? (1 + takeProfitTarget) : (1 - takeProfitTarget)

            const stopLossPrice = this.toPrecisionPrice(order.averagePrice * stopLossMultiplier)
            const takeProfitPrice = this.toPrecisionPrice(order.averagePrice * takeProfitMultiplier)

            const exitSide = positionSide === 'LONG' ? 'SELL' : 'BUY'
            const exitParams = this.config.isHedgeMode || this.isBacktest ? { positionSide } : { reduceOnly: true }
            const triggerDirection = positionSide === 'LONG' ? 2 : 1

            const [stopLossOrder, takeProfitOrder] = await Promise.all([
                this.exchange.createStopLossOrder(
                    this.pairName,
                    exitSide,
                    this.quantity,
                    stopLossPrice,
                    { 
                        ...exitParams, 
                        ...this.createClientOrderId('I-P'),
                        triggerDirection: triggerDirection,
                        reduceOnly: true,
                    }
                ),
                this.exchange.createLimitOrder(
                    this.pairName,
                    exitSide,
                    this.quantity,
                    takeProfitPrice,
                    { ...exitParams, ...this.createClientOrderId('I-P'), reduceOnly: true }
                )
            ])

            this.fundingIgnoredDeltaProfitOpenOrders.push(stopLossOrder, takeProfitOrder)
            
            logger.info(chalk.green(`[Bot ${this.pairName} (I-P)] Placed Stop-Loss ${positionSide} ${exitSide} ${stopLossOrder.type?.toUpperCase()} order: TRIGGER ${stopLossOrder.amount} @ ${stopLossOrder.triggerPrice}`))
            logger.info(chalk.green(`[Bot ${this.pairName} (I-P)] Placed Take-Profit ${positionSide} ${exitSide} ${takeProfitOrder.type?.toUpperCase()} order: LIMIT ${takeProfitOrder.amount} @ ${takeProfitOrder.price}`))
        } catch (error) {
            if (shouldFilterError([-2022], error)) return
            logger.error(chalk.red(`[Bot ${this.pairName} (I-P)] Error handling position open: ${error.message}`))
        }
    }

    async handlePositionCloseFundingIgnoredDeltaProfit() {
        // if (!this.isFundingIgnoredDeltaProfitPositionOpen) return
        try {
            logger.info(chalk.yellow(`[Bot ${this.pairName} (I-P)] Cancelling all open orders...`))

            const orderIds = this.fundingIgnoredDeltaProfitOpenOrders.map(order => order.id)

            if (orderIds.length > 0) {
                const orders = await this.exchange.cancelOrders(this.pairName, orderIds)

                logger.info(chalk.green(`[Bot ${this.pairName} (I-P)] Successfully cancelled ${orders.length} orders`))
            }

            this.isFundingIgnoredDeltaProfitPositionOpen = false
        } catch (error) {
            if (shouldFilterError([-2011], error)) return
            logger.error(chalk.red(`[Bot ${this.pairName} (I-P)] Error handling position close: ${error.message}`))
        } finally {
            this.isFundingIgnoredDeltaProfitExecutionDone = true
            await this.initiateShutdown()
        }
    }

    // ********** FUNDING LOSS DELTA PROFIT STRATEGY **********

    async openFundingLossDeltaProfitPosition() {
        if (this.isFundingLossDeltaProfitPositionOpen) return

        try {
            const bestPrice = this.isPositiveFunding ? this.orderBook.askPrice : this.orderBook.bidPrice

            this.quantity = this.toPrecisionQuantity(this.config.amount / bestPrice)

            const fundingRate = Math.abs(this.fundingData.fundingRate)

            if (fundingRate < this.config.LP_MinFundingRate) {
                logger.info(chalk.red(`[Bot ${this.pairName} (L-P)] Funding rate is too low to open ${this.isPositiveFunding ? 'LONG' : 'SHORT'} position: ${this.fundingData.fundingRate}`))
                this.isFundingLossDeltaProfitExecutionDone = true
                return
            }

            const entrySide = this.isPositiveFunding ? 'BUY' : 'SELL'
            const positionSide = this.isPositiveFunding ? 'LONG' : 'SHORT'
            const entryParams = this.config.isHedgeMode || this.isBacktest ? { positionSide } : {}

            const entryOrder = await this.exchange.createMarketOrder(
                this.pairName,
                entrySide,
                this.quantity,
                { ...entryParams, ...this.createClientOrderId('L-P') }
            )

            logger.info(chalk.green(`[Bot ${this.pairName} (L-P)] Placed ENTRY ${positionSide} ${entrySide} ${entryOrder.type?.toUpperCase()} order: FILLED ${entryOrder.filled} @ ${entryOrder.average}`))
        } catch (error) {
            logger.error(chalk.red(`[Bot ${this.pairName} (L-P)] Error placing ENTRY order: ${error.message}`))
        }
    }

    async closeFundingLossDeltaProfitPosition() {
        if (!this.isFundingLossDeltaProfitPositionOpen) return

        try {
            const exitSide = this.isPositiveFunding ? 'SELL' : 'BUY'
            const positionSide = this.isPositiveFunding ? 'LONG' : 'SHORT'
            const exitParams = this.config.isHedgeMode || this.isBacktest ? { positionSide } : { reduceOnly: true }

            const exitOrder = await this.exchange.createMarketOrder(
                this.pairName,
                exitSide,
                this.quantity,
                { ...exitParams, ...this.createClientOrderId('L-P'), reduceOnly: true }
            )
            
            logger.info(chalk.green(`[Bot ${this.pairName} (L-P)] Placed EXIT ${positionSide} ${exitSide} ${exitOrder.type?.toUpperCase()} order: FILLED ${exitOrder.filled} @ ${exitOrder.average}`))
        } catch (error) {
            if (shouldFilterError([-2022], error)) return
            logger.error(chalk.red(`[Bot ${this.pairName} (L-P)] Error placing EXIT order: ${error.message}`))
        }
    }

    async handlePositionOpenFundingLossDeltaProfit(order) {
        if (this.isFundingLossDeltaProfitPositionOpen) return

        this.isFundingLossDeltaProfitPositionOpen = true

        try {
            const positionSide = order.positionSide

            const fundingRate = Math.abs(this.fundingData.fundingRate)

            const defaultTakeProfit = this.config.commission + this.config.LP_TargetProfit

            const FUNDING_RATE_TO_TAKE_PROFIT_RATIO = 0.5
            const premiumTakeProfit = fundingRate * FUNDING_RATE_TO_TAKE_PROFIT_RATIO

            const breakEvenTakeProfit = this.config.commission + fundingRate

            const acceptableLossTakeProfit =  breakEvenTakeProfit - this.config.LP_AcceptableLoss

            const stopLossMultiplier = positionSide === 'LONG' ? (1 - this.config.LP_StopLoss) : (1 + this.config.LP_StopLoss)
            const takeProfitMultiplier = positionSide === 'LONG' ? (1 + (defaultTakeProfit)) : (1 - (defaultTakeProfit))

            const stopLossPrice = this.toPrecisionPrice(order.averagePrice * stopLossMultiplier)
            const takeProfitPrice = this.toPrecisionPrice(order.averagePrice * takeProfitMultiplier)

            const exitSide = positionSide === 'LONG' ? 'SELL' : 'BUY'
            const exitParams = this.config.isHedgeMode || this.isBacktest ? { positionSide } : { reduceOnly: true }
            const triggerDirection = positionSide === 'LONG' ? 2 : 1

            const [stopLossOrder, takeProfitOrder] = await Promise.all([
                this.exchange.createStopLossOrder(
                    this.pairName,
                    exitSide,
                    this.quantity, 
                    stopLossPrice,
                    { 
                        ...exitParams, 
                        ...this.createClientOrderId('L-P'),
                        triggerDirection: triggerDirection,
                        reduceOnly: true,
                    }
                ),
                this.exchange.createLimitOrder(
                    this.pairName,
                    exitSide, 
                    this.quantity,
                    takeProfitPrice,
                    { ...exitParams, ...this.createClientOrderId('L-P'), reduceOnly: true, }
                )
            ])

            this.fundingLossDeltaProfitOpenOrders.push(stopLossOrder, takeProfitOrder)
            
            logger.info(chalk.green(`[Bot ${this.pairName} (L-P)] Placed Stop-Loss ${positionSide} ${exitSide} ${stopLossOrder.type?.toUpperCase()} order: TRIGGER ${stopLossOrder.amount} @ ${stopLossOrder.triggerPrice}`))
            logger.info(chalk.green(`[Bot ${this.pairName} (L-P)] Placed Take-Profit ${positionSide} ${exitSide} ${takeProfitOrder.type?.toUpperCase()} order: LIMIT ${takeProfitOrder.amount} @ ${takeProfitOrder.price}`))
        } catch (error) {
            if (shouldFilterError([-2022], error)) return
            logger.error(chalk.red(`[Bot ${this.pairName} (L-P)] Error handling position open: ${error.message}`))
        }
    }

    async handlePositionCloseFundingLossDeltaProfit() {
        if (!this.isFundingLossDeltaProfitPositionOpen) return
        try {
            logger.info(chalk.yellow(`[Bot ${this.pairName} (L-P)] Cancelling all open orders...`))

            const orderIds = this.fundingLossDeltaProfitOpenOrders.map(order => order.id)

            if (orderIds.length > 0) {
                const orders = await this.exchange.cancelOrders(this.pairName, orderIds)

                logger.info(chalk.green(`[Bot ${this.pairName} (L-P)] Successfully cancelled ${orders.length} orders`))
            }

            this.isFundingLossDeltaProfitPositionOpen = false
        } catch (error) {
            if (shouldFilterError([-2011], error)) return
            logger.error(chalk.red(`[Bot ${this.pairName} (L-P)] Error handling position close: ${error.message}`))
        } finally {
            this.isFundingLossDeltaProfitExecutionDone = true
            await this.initiateShutdown()
        }
    }

    async initiateShutdown() {
        if (
            this.config.isFundingProfitDeltaIgnoredStrategy === this.isFundingProfitDeltaIgnoredExecutionDone &&
            this.config.isFundingIgnoredDeltaProfitStrategy === this.isFundingIgnoredDeltaProfitExecutionDone &&
            this.config.isFundingLossDeltaProfitStrategy === this.isFundingLossDeltaProfitExecutionDone
        ) {
            await this.stop()
        }
    }

    async stop() {
        if (this.isShuttingDown) return
        this.isShuttingDown = true

        logger.info(chalk.yellow(`[Bot ${this.pairName}]` + '='.repeat(50)))
        logger.info(chalk.yellow(`[Bot ${this.pairName}] Initiating graceful shutdown`))
        logger.info(chalk.yellow(`[Bot ${this.pairName}]` + '='.repeat(50)))

        try {
            if (this.fundingRateCron) this.fundingRateCron.stop()
            if (this.openFundingProfitDeltaIgnoredCron) this.openFundingProfitDeltaIgnoredCron.stop()
            if (this.closeFundingProfitDeltaIgnoredCron) this.closeFundingProfitDeltaIgnoredCron.stop()
            if (this.openFundingIgnoredDeltaProfitCron) this.openFundingIgnoredDeltaProfitCron.stop()
            if (this.closeFundingIgnoredDeltaProfitCron) this.closeFundingIgnoredDeltaProfitCron.stop()
            if (this.openFundingLossDeltaProfitCron) this.openFundingLossDeltaProfitCron.stop()
            if (this.closeFundingLossDeltaProfitCron) this.closeFundingLossDeltaProfitCron.stop()

            logger.info(chalk.yellow(`[Bot ${this.pairName}] Closing WebSocket connections...`))
            this.exchange.closeAll()

            logger.info(chalk.yellow(`[Bot ${this.pairName}] Cancelling all open orders...`))
            const orders = await this.exchange.cancelAllOrders(this.pairName)
            logger.info(chalk.green(`[Bot ${this.pairName}] Successfully cancelled ${this.exchange.marketType === 'spot' ? orders.length : 'all'} orders`))
            
            const [baseAsset] = this.pairName.split('/')
            const balance = await this.exchange.fetchBalance()

            if (this.exchange.marketType === 'spot') {
                const baseBalance = balance[baseAsset]?.free
                if (baseBalance && baseBalance > 0) {
                    logger.info(chalk.yellow(`[Bot ${this.pairName}] Selling remaining ${baseBalance} ${baseAsset} at market price...`))
                    const exitOrder = await this.exchange.createMarketSellOrder(this.pairName, baseBalance, { reduceOnly: true })
                    logger.info(chalk.green(`[Bot ${this.pairName}] Successfully sold ${exitOrder.filled} ${baseAsset} at ${exitOrder.average}`))
                }
            } else if (this.exchange.marketType === 'linear') {
                
                // TODO: implement support for BYBIT
                if (this.exchange.exchange.id === 'bybit') {
                    return
                }

                const positions = balance.info.positions.filter(p => p.symbol === this.pairName.replace('/', ''))

                for (const position of positions) {
                    const positionAmount = parseFloat(position?.positionAmt || 0)
                    const positionSide = position?.positionSide

                    if (position && positionAmount !== 0) {
                        logger.info(chalk.yellow(`[Bot ${this.pairName}] Closing futures ${positionSide} position of ${positionAmount} ${baseAsset}...`))

                        const params = this.config.isHedgeMode || this.isBacktest ? { positionSide: position?.positionSide } : { reduceOnly: true }

                        const exitOrder = positionAmount > 0 ? 
                            await this.exchange.createMarketSellOrder(this.pairName, Math.abs(positionAmount), params) :
                            await this.exchange.createMarketBuyOrder(this.pairName, Math.abs(positionAmount), params)
                        logger.info(chalk.green(`[Bot ${this.pairName}] Successfully closed futures ${positionSide} position of ${exitOrder.filled} ${baseAsset} at ${exitOrder.average}`))
                    }
                }
            }

            logger.info(chalk.yellow(`[Bot ${this.pairName}]` + '='.repeat(50)))
            logger.info(chalk.yellow(`[Bot ${this.pairName}] Graceful shutdown complete`))
            logger.info(chalk.yellow(`[Bot ${this.pairName}]` + '='.repeat(50)))
        } catch (error) {
            logger.error(chalk.red(`[Bot ${this.pairName}] Error during shutdown: ${error.message}`))
        } finally {
            removeBotFromGracefulShutdown(this)
        }
    }
}

export default FundingBot