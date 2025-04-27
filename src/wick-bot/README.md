# Wick Bot Trading Strategy

The Wick Bot is a trading strategy that identifies historical wicks at local highs and lows, and opens positions when the price revisits these levels.

## Strategy Overview

### For LONG Positions:
1. Identify historical wick-downs at local lows.
   - "Historical" refers to all candles excluding the current candle.
   - If there are multiple wicks at the local low - Take into account only the lowest wick.

2. If the price on the current candle drops below the end of a historical wick, and then reverses back up to that wick end, open a LONG position.

3. The stop-loss is set at the low of the current candle.
   - The take-profit is set at a 2:1 risk/reward ratio — calculated as twice the distance between the entry price and the stop-loss.

4. Identified historical wick level can only be triggered once.

### For SHORT Positions:
1. Identify historical wick-ups at local highs.
   - "Historical" refers to all candles excluding the current candle.
   - If there are multiple wicks at the local high - Take into account only the highest wick.

2. If the price on the current candle rises above the end of a historical wick, and then reverses back down to that wick end, open a SHORT position.

3. The stop-loss is set at the high of the current candle.
   - The take-profit is set at a 2:1 risk/reward ratio — calculated as twice the distance between the entry price and the stop-loss.

4. Identified historical wick level can only be triggered once.

## Configuration Parameters

The Wick Bot can be configured with the following parameters:

1. `maxHistoricalCandleLookback` – The max number of candles between the current candle and historical candle. Candles outside this window are ignored.
2. `minHistoricalCandleLookback` – The min number of candles between the current candle and the first historical candle. If set to 0, the first previous candle from the current one is a qualifying candle used as the historical reference.
3. `minHistoricalWickSize` – The minimum wick size (in percentage) used to qualify a candle as having a valid wick. This is the distance from the wick end to the candle body.
4. `minCurrentWickSize` – The minimum difference (in percentage) between the end of the historical wick and the low/high of the current candle that later reverts back to the wick end. This acts as a validation check for entry conditions.