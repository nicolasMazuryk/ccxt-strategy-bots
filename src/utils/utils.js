import Decimal from 'decimal.js'

const formatNumberWithPrecision = precision => value => {
    const decimal = new Decimal(value)
    return decimal.toDecimalPlaces(precision).toNumber()
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Helper to pad numbers with leading zero
const padNumber = num => num.toString().padStart(2, '0')

export { formatNumberWithPrecision, wait, padNumber }