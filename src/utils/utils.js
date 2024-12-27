import Decimal from 'decimal.js';

const formatNumberWithPrecision = precision => value => {
    const decimal = new Decimal(value);
    return decimal.toDecimalPlaces(precision).toNumber();
};

export { formatNumberWithPrecision };