const TIERED_MAINTENANCE = {
    'ETH/USDT': [
        { notionalCap: 50000, rate: 0.004 },
        { notionalCap: 600000, rate: 0.005 },
        { notionalCap: 3000000, rate: 0.0065 },
    ],
    'AMB/USDT': [
        { notionalCap: 5000, rate: 0.02 },
        { notionalCap: 25000, rate: 0.025 },
        { notionalCap: 200000, rate: 0.05 },
    ]
}

const getMaintenanceRate = (pairName, notional) => {
    const tiers = TIERED_MAINTENANCE[pairName]
    for (const tier of tiers) {
        if (notional <= tier.notionalCap) return tier.rate
    }
    return tiers[tiers.length - 1].rate
}

export { TIERED_MAINTENANCE, getMaintenanceRate }