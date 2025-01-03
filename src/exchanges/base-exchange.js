class BaseExchange {
    constructor(marketType) {
        if (this.constructor === BaseExchange) {
            throw new Error('BaseExchange is an abstract class and cannot be instantiated directly')
        }
        if (!marketType) {
            throw new Error('marketType is required')
        }
        this.marketType = marketType
    }

    async createLimitBuyOrder(symbol, quantity, price) {
        throw new Error('Method createLimitBuyOrder must be implemented')
    }

    async createLimitSellOrder(symbol, quantity, price) {
        throw new Error('Method createLimitSellOrder must be implemented')
    }

    async fetchOrderBook(symbol) {
        throw new Error('Method fetchOrderBook must be implemented')
    }

    async initializeWebSocket() {
        throw new Error('Method initializeWebSocket must be implemented')
    }

    async subscribeToUserData() {
        throw new Error('Method subscribeToUserData must be implemented')
    }

    async subscribeToBookTicker(symbol) {
        throw new Error('Method subscribeToBookTicker must be implemented')
    }

    async closeAll() {
        throw new Error('Method closeAll must be implemented')
    }

    onOrderUpdate(order) {
        throw new Error('Method onOrderUpdate must be implemented')
    }

    onPriceUpdate(data) {
        throw new Error('Method onPriceUpdate must be implemented')
    }

    async cancelAllOrders(symbol) {
        throw new Error('cancelAllOrders method must be implemented by the exchange')
    }

    async fetchBalance() {
        throw new Error('fetchBalance method must be implemented by the exchange')
    }

    async createMarketSellOrder(symbol, amount) {
        throw new Error('createMarketSellOrder method must be implemented by the exchange')
    }
}

export { BaseExchange }