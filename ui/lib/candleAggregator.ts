import type { Candle, TradeMsg } from "@/types/ws";

type CandleAggregator = {
  seed: (candles: Candle[]) => void;
  onTrade: (trade: TradeMsg) => Candle;
};

export function createCandleAggregator(): CandleAggregator {
  let lastCandle: Candle | null = null;

  return {
    seed(candles: Candle[]) {
      lastCandle = candles.length ? candles[candles.length - 1] : null;
    },

    onTrade(trade: TradeMsg): Candle {
      const tradeSecond = Math.floor(trade.ts / 1000);

      if (!lastCandle || lastCandle.time !== tradeSecond) {
        lastCandle = {
          time: tradeSecond,
          open: trade.price,
          high: trade.price,
          low: trade.price,
          close: trade.price,
          volume: trade.size,
        };
        return lastCandle;
      }

      lastCandle = {
        ...lastCandle,
        high: Math.max(lastCandle.high, trade.price),
        low: Math.min(lastCandle.low, trade.price),
        close: trade.price,
        volume: lastCandle.volume + trade.size,
      };

      return lastCandle;
    },
  };
}
