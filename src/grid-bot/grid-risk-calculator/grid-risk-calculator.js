// TODO: IMPROVEMENTS
// 1. add Geometric Grid Support. The calculator only supports arithmetic grids. Consider adding support for geometric grids which are often more suitable for crypto markets.
import chalk from 'chalk';
import logger from '../../utils/logger.js';
import { formatNumberWithPrecision } from '../../utils/utils.js';

const gridMode = 'Arithmetic';

const gridRiskCalculator = ({
    lowerPrice,
    upperPrice,
    gridNumber,
    pricePrecision,
    tradingFee,
    maintenanceMarginRate,
    quantityPerGrid,
    leverage,
    investedAmount,
}) => {
    if (gridNumber > 200) throw new Error('Grid number cannot exceed > 200')

    const toPrecision = formatNumberWithPrecision(pricePrecision);
    const gridLevels = [];

    const gridStep = toPrecision((upperPrice - lowerPrice) / gridNumber); // Price step in arithmetic mode

    // Generate the grid levels
    for (let i = 0; i < gridNumber; i++) {
        let gridPrice = toPrecision(lowerPrice + (i * gridStep));
        gridLevels.push(gridPrice);
    }

    // Function to calculate profit per grid in $ and %
    function calculateProfitPerGrid(lowerPrice, upperPrice) {
        let profitWithoutFee = (upperPrice - lowerPrice) * quantityPerGrid;
        let fee = (lowerPrice + upperPrice) * tradingFee * quantityPerGrid;
        let profitWithFee = profitWithoutFee - fee;
        let profitPercent = (profitWithFee / (lowerPrice * quantityPerGrid)) * 100;
        let absoluteProfitPercent = (profitWithFee / investedAmount) * 100;

        return {
            profitWithFee: profitWithFee,
            profitPercent: profitPercent,
            absoluteProfitPercent: absoluteProfitPercent
        };
    }

    // Calculate profit per grid for the lowest and highest grids
    const lowestGridProfit = calculateProfitPerGrid(gridLevels[0], gridLevels[1]);
    const highestGridProfit = calculateProfitPerGrid(gridLevels[gridLevels.length - 1], toPrecision(gridLevels[gridLevels.length - 1] + gridStep));

    // Calculate margin required to open trades on all grid levels
    let totalMarginRequired = 0;
    for (let i = 0; i < gridLevels.length; i++) {
        let marginRequired = (gridLevels[i] * quantityPerGrid) / leverage;
        totalMarginRequired += marginRequired;
    }

    // Calculate Unrealized P&L in the worst case scenario
    let unrealizedPnL = 0;
    for (let i = 0; i < gridLevels.length; i++) {
        let entryPrice = gridLevels[i];
        let currentPrice = lowerPrice;
        let positionSize = quantityPerGrid;
        let pnlPerGrid = (currentPrice - entryPrice) * positionSize;
        unrealizedPnL += pnlPerGrid;
    }

    // Calculate trading fees for each grid level
    let totalTradingFees = 0;
    for (let i = 0; i < gridLevels.length; i++) {
        let tradingFeePerGrid = (gridLevels[i] * quantityPerGrid * tradingFee) + (toPrecision(gridLevels[i] + gridStep) * quantityPerGrid * tradingFee);
        totalTradingFees += tradingFeePerGrid;
    }

    // Calculate maximum drawdown
    const maxDrawdown = Math.abs(unrealizedPnL + totalTradingFees);
    const maxDrawdownPercent = (maxDrawdown / investedAmount) * 100;

    // Calculate risk/reward ratio per grid
    const riskPerGrid = (gridStep * quantityPerGrid) + (2 * tradingFee * quantityPerGrid * upperPrice); // Maximum possible loss per grid
    const rewardPerGrid = lowestGridProfit.profitWithFee;
    const riskRewardRatio = rewardPerGrid / riskPerGrid;

    // Calculate position size as percentage of account
    const singlePositionValue = quantityPerGrid * upperPrice;
    const singlePositionSizePercent = (singlePositionValue / investedAmount) * 100;

    // Calculate maximum number of concurrent positions
    const maxConcurrentPositions = Math.floor(investedAmount / (singlePositionValue / leverage));

    const maxExposure = gridLevels.reduce((total, price) => 
        total + (price * quantityPerGrid), 0);

    const accountRiskPercentage = (maxExposure / investedAmount) * 100;

    const pricePrecisionStepDecrease = toPrecision(Math.pow(10, -pricePrecision));

    // Calculate the price level at which remaining margin reaches 0
    let remainingMargin = investedAmount - totalMarginRequired - totalTradingFees;
    let priceDropToZeroMargin = upperPrice;
    let cumulativePnL = 0;

    // Iterate to find the price level where remaining margin reaches 0
    while (remainingMargin + cumulativePnL > 0) {
        priceDropToZeroMargin = toPrecision(priceDropToZeroMargin - pricePrecisionStepDecrease); // Decrease price by a small step
        cumulativePnL = 0;
        for (let i = 0; i < gridLevels.length; i++) {
            let entryPrice = gridLevels[i];
            let positionSize = quantityPerGrid;
            let pnlPerGrid = (priceDropToZeroMargin - entryPrice) * positionSize;
            cumulativePnL += pnlPerGrid;
        }
    }

    // Calculate the percentage distance from the lowest grid level
    let percentageDistance = ((lowerPrice - priceDropToZeroMargin) / lowerPrice) * 100;

    // Calculate the liquidation price level at which investedAmount reaches 0
    let liquidationPrice = upperPrice;
    let cumulativeLoss = 0;

    // Iterate to find the liquidation price level where invested amount reaches 0
    while (investedAmount + (cumulativeLoss * (1 + maintenanceMarginRate)) - totalTradingFees > 0) {
        liquidationPrice = toPrecision(liquidationPrice - pricePrecisionStepDecrease); // Decrease price by a small step
        cumulativeLoss = 0;
        for (let i = 0; i < gridLevels.length; i++) {
            let entryPrice = gridLevels[i];
            let positionSize = quantityPerGrid;
            let lossPerGrid = (liquidationPrice - entryPrice) * positionSize;
            cumulativeLoss += lossPerGrid;
        }
    }
    // Calculate the percentage distance from the lowest grid level to the liquidation price
    let liquidationPercentageDistance = ((lowerPrice - liquidationPrice) / lowerPrice) * 100;

    // Output the analysis results in a clear, formatted way
    logger.info(chalk.bold('\n=== Grid Trading Analysis ==='));
    
    logger.info(chalk.cyan('\n--- Grid Configuration ---'));
    logger.info(`Number of Grids: ${chalk.yellow(gridNumber)}`);
    logger.info(`Grid Step Size: ${chalk.yellow('$' + toPrecision(gridStep))}`);
    logger.info(`Price Range: ${chalk.yellow('$' + toPrecision(lowerPrice))} - ${chalk.yellow('$' + toPrecision(upperPrice))}`);
    
    logger.info(chalk.cyan('\n--- Profit Analysis ---'));
    logger.info(`Profit Per Grid (USD): ${chalk.green('$' + toPrecision(lowestGridProfit.profitWithFee))} - ${chalk.green('$' + toPrecision(highestGridProfit.profitWithFee))}`);
    logger.info(`Profit Per Grid (%): ${chalk.green(lowestGridProfit.profitPercent.toFixed(2) + '%')} - ${chalk.green(highestGridProfit.profitPercent.toFixed(2) + '%')}`);
    logger.info(`Profit Per Grid (Absolute %): ${chalk.green(lowestGridProfit.absoluteProfitPercent.toFixed(4) + '%')} - ${chalk.green(highestGridProfit.absoluteProfitPercent.toFixed(4) + '%')}`);
    
    logger.info(chalk.cyan('\n--- Risk Metrics ---'));
    logger.info(`Total Margin Required: ${chalk.yellow('$' + totalMarginRequired.toFixed(2))}`);
    logger.info(`Total Trading Fees: ${chalk.yellow('$' + totalTradingFees.toFixed(2))}`);
    logger.info(`Worst Case Unrealized P&L: ${chalk.red('$' + unrealizedPnL.toFixed(2))}`);
    logger.info(`Maximum Drawdown: ${chalk.red('$' + maxDrawdown.toFixed(2))} (${chalk.red(maxDrawdownPercent.toFixed(2) + '%')})`);
    logger.info(`Risk/Reward Ratio per Grid: ${chalk.yellow(riskRewardRatio.toFixed(2))}`);
    logger.info(`Single Position Size: ${chalk.yellow(singlePositionSizePercent.toFixed(2) + '%')} of account`);
    logger.info(`Maximum Concurrent Positions: ${chalk.yellow(maxConcurrentPositions)}`);
    logger.info(`Maximum Exposure: ${chalk.yellow('$' + maxExposure.toFixed(2))}`);
    logger.info(`Max Exposure / Invested Amount: ${chalk.yellow(accountRiskPercentage.toFixed(2) + '%')}`);
    
    logger.info(chalk.cyan('\n--- Critical Price Levels ---'));
    logger.info(`Zero Margin Price: ${chalk.red('$' + toPrecision(priceDropToZeroMargin))} (${chalk.red(percentageDistance.toFixed(2) + '%')} below lowest grid)`);
    logger.info(`Liquidation Price: ${chalk.red('$' + toPrecision(liquidationPrice))} (${chalk.red(liquidationPercentageDistance.toFixed(2) + '%')} below lowest grid)`);
    
    logger.info(chalk.cyan('\n--- Grid Levels ---'));
    gridLevels.forEach((level, index) => {
        logger.info(`Grid ${chalk.yellow(index + 1)}: ${chalk.yellow('$' + toPrecision(level))}`);
    });
    logger.info(chalk.bold('========================\n'));

    return { gridStep }
}

export { gridRiskCalculator }