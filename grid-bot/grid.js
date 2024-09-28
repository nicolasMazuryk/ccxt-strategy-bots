
// Input parameters for the crypto futures grid bot
const lowerPrice = 0.0062;  // Lower price range
const upperPrice = 0.01;  // Upper price range
const gridNumber = 145;    // Number of grids
const leverage = 4;  // Leverage
const investedAmount = 500;  // Invested amount in USD

const amountPerGridInCoins = 1100; // Amount per grid in coins

const gridMode = 'Arithmetic';  // Grid mode: Arithmetic
const tradingFee = 0.0002;  // Trading fee per trade (0.02%)
const maintenanceMarginRate = 0.0065; // Maintenance Margin Requirement (0.65%)

// Output parameters
let gridLevels = [];
let gridStep = (upperPrice - lowerPrice) / gridNumber; // Price step in arithmetic mode

// Generate the grid levels
for (let i = 0; i < gridNumber; i++) {
    let gridPrice = lowerPrice + (i * gridStep);
    gridLevels.push(gridPrice);
}

// Function to calculate profit per grid in $ and %
function calculateProfitPerGrid(lowerPrice, upperPrice) {
    let profitWithoutFee = upperPrice - lowerPrice;
    let fee = (lowerPrice + upperPrice) * tradingFee;
    let profitWithFee = profitWithoutFee - fee;
    let profitPercent = (profitWithFee / lowerPrice) * 100;
    return {
        profitWithFee: profitWithFee,
        profitPercent: profitPercent
    };
}

// Calculate profit per grid for the lowest and highest grids
let lowestGridProfit = calculateProfitPerGrid(gridLevels[0], gridLevels[1]);
let highestGridProfit = calculateProfitPerGrid(gridLevels[gridLevels.length - 1], gridLevels[gridLevels.length - 1] + gridStep);

// Calculate margin required to open trades on all grid levels
let totalMarginRequired = 0;
for (let i = 0; i < gridLevels.length; i++) {
    let marginRequired = (gridLevels[i] * amountPerGridInCoins) / leverage;
    totalMarginRequired += marginRequired;
}

// Calculate Unrealized P&L in the worst case scenario
let unrealizedPnL = 0;
for (let i = 0; i < gridLevels.length; i++) {
    let entryPrice = gridLevels[i];
    let currentPrice = lowerPrice;
    let positionSize = amountPerGridInCoins;
    let pnlPerGrid = (currentPrice - entryPrice) * positionSize;
    unrealizedPnL += pnlPerGrid;
}

// Calculate trading fees for each grid level
let totalTradingFees = 0;
for (let i = 0; i < gridLevels.length; i++) {
    let tradingFeePerGrid = (gridLevels[i] * amountPerGridInCoins * tradingFee) + ((gridLevels[i] + gridStep) * amountPerGridInCoins * tradingFee);
    totalTradingFees += tradingFeePerGrid;
}

// Calculate the price level at which remaining margin reaches 0
let remainingMargin = investedAmount - totalMarginRequired - totalTradingFees;
let priceDropToZeroMargin = upperPrice;
let cumulativePnL = 0;

// Iterate to find the price level where remaining margin reaches 0
while (remainingMargin + cumulativePnL > 0) {
    priceDropToZeroMargin -= 0.0001; // Decrease price by a small step
    cumulativePnL = 0;
    for (let i = 0; i < gridLevels.length; i++) {
        let entryPrice = gridLevels[i];
        let positionSize = amountPerGridInCoins;
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
    liquidationPrice -= 0.0001; // Decrease price by a small step
    cumulativeLoss = 0;
    for (let i = 0; i < gridLevels.length; i++) {
        let entryPrice = gridLevels[i];
        let positionSize = amountPerGridInCoins;
        let lossPerGrid = (liquidationPrice - entryPrice) * positionSize;
        cumulativeLoss += lossPerGrid;
    }
}

// Calculate the percentage distance from the lowest grid level to the liquidation price
let liquidationPercentageDistance = ((lowerPrice - liquidationPrice) / lowerPrice) * 100;

// Output the grid levels, profit per grid, total margin required, unrealized P&L, price level, percentage distance, and total trading fees
console.log("Grid Levels:", gridLevels);
console.log("Profit Per Grid Range: $", lowestGridProfit.profitWithFee.toFixed(4), " - $", highestGridProfit.profitWithFee.toFixed(4));
console.log("Profit Per Grid Range: %", lowestGridProfit.profitPercent.toFixed(2), " - %", highestGridProfit.profitPercent.toFixed(2));
console.log("Total Margin Required: $", totalMarginRequired.toFixed(2));
console.log("Unrealized P&L (Worst Case Scenario): $", unrealizedPnL.toFixed(2));
console.log("Total Trading Fees: $", totalTradingFees.toFixed(2));
console.log("Price Level at Remaining Margin 0: $", priceDropToZeroMargin.toFixed(4));
console.log("Percentage Distance from Lowest Grid Level: %", percentageDistance.toFixed(2));
console.log("Liquidation Price Level: $", liquidationPrice.toFixed(4));
console.log("Liquidation Percentage Distance from Lowest Grid Level: %", liquidationPercentageDistance.toFixed(2));
