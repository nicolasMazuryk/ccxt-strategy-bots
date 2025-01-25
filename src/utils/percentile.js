// Sample price data (replace with your own data)
const priceData = [
    100, 102, 103, 104, 103, 102, 101, 100, 98, 99,
    97, 95, 94, 96, 97, 99, 100, 101, 103, 104
];

// Function to calculate the top and bottom 15% percentiles
function calculatePercentiles(prices, lowerPercentile = 15, upperPercentile = 85) {
    // Sort prices in ascending order
    const sortedPrices = [...prices].sort((a, b) => a - b);

    // Calculate indices for the percentiles
    const lowerIndex = Math.floor((lowerPercentile / 100) * sortedPrices.length);
    const upperIndex = Math.ceil((upperPercentile / 100) * sortedPrices.length) - 1;

    // Get the values at the calculated indices
    const lowerBound = sortedPrices[lowerIndex];
    const upperBound = sortedPrices[upperIndex];

    return { lowerBound, upperBound };
}

// Calculate the bounds
const { lowerBound, upperBound } = calculatePercentiles(priceData);

console.log("Price spent 15% of the time below:", lowerBound);
console.log("Price spent 15% of the time above:", upperBound);


// you are the best algotrader expert. You need to analyze the range where the price statistically spent most of the time. We need to to find the top and bottom 15 percentile, meaning the price spent 15% of the TIME in this zones. Build a script in javascirpt to calculate this.

// Here’s a JavaScript script that calculates the top and bottom 15th percentiles of a price dataset, based on the amount of time spent at each price. This script assumes you have a time-series dataset of prices and that each price occurs at regular intervals.