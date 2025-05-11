SELECTION
1. cron job that runs the function to analyze best upcomming funding arbitrage opportunities every hour 5 min before XX:00
2. someday later: run backtesting to determine success rate and best entry-exit parameters (skip for now)

TRADE
2 mins before the Funding Event
1. Subscribe to Order and Market Price (best bid/ask) streams
    1.1 take into account whether it is 1,2,4 or 8h interval (the higher - the bigger impact)
2. Open order 1-2 seconds before the Funding event


TODO:
- [15m] graceful shotdown 1 bot is not stopped (pending position and orders)
- [30m] Move MinFundingRate/MaxFundingRate condition from TRADING step to the SELECTION step for all strategies
- [1h] implement Trailing Stop Loss

- [1h] research data listing all pair's funding rates at specific time (find best opportunities)
- + [1h] research data showing ACTUAL timestamp of accruing funding rate

- [] build and try Strategy #3 on other exchanges: Bybit, Bitget, MEXC, etc.

7. [6h] build backtesting infrastructure
8. [1h] optimize for backtesting (sync/async)
9. [3h] test backtesting end-to-end
10. [4h] run backtests
11. [3h] deploy to production

- [] Strategy 3.1: set 2 exit limit orders
    - quick exit rapid drop take-profit before funding applied. Cancel at 00:01
    - breakeven take-profit

- [] Test Startegy 1 & 3.1, which are counterprofitable. Goal: check whether funding settlement delay is applied to both LONG and SHORT positions.

6. [3h] refactor, simplify
6. [1h] test refactored code
10. [6h] someday later: run backtesting on SELECTION phase to determine success rate and best entry-exit parameters (skip for now)

- [] Calculate you own Raw Premium Index = Futures Price - Index Price. It can either decrease or increase profitability in conjunction with Funding Rate.


-----
0.8729 BNFCR