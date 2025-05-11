import Decimal from 'decimal.js'

const formatNumberWithPrecision = precision => value => {
    const decimal = new Decimal(value)
    if (precision === 0) {
        return decimal.round().toNumber()
    }
    return decimal.toDecimalPlaces(precision).toNumber()
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Helper to pad numbers with leading zero
const padNumber = num => num.toString().padStart(2, '0')

function chunkArray(array, size) {
    const result = []
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size))
    }
    return result
}

function getDecimals(number) {
    // Handle numbers in scientific notation
    const match = number.toString().match(/e-(\d+)/i)
    if (match) {
        return parseInt(match[1], 10)
    }
    // Handle regular decimal numbers
    const str = Math.abs(number).toString()
    const afterDecimal = str.split('.')[1]
    if (!afterDecimal) return 0

    return afterDecimal.length
}




export { formatNumberWithPrecision, wait, padNumber, chunkArray, getDecimals }