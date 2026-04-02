import { describe, expect, it } from "vitest";

import { createCandleAggregator } from "@/lib/candleAggregator";
import type { TradeMsg } from "@/types/ws";

describe("createCandleAggregator", () => {
  it("creates a new candle for a new second", () => {
    const agg = createCandleAggregator();

    const trade: TradeMsg = {
      type: "trade",
      id: "t_1",
      price: 100,
      size: 1,
      side: "buy",
      ts: 1710000000000,
    };

    const candle = agg.onTrade(trade);
    expect(candle.time).toBe(Math.floor(trade.ts / 1000));
    expect(candle.open).toBe(100);
    expect(candle.volume).toBe(1);
  });

  it("updates the same candle inside one second", () => {
    const agg = createCandleAggregator();

    const t1: TradeMsg = {
      type: "trade",
      id: "t_1",
      price: 100,
      size: 1,
      side: "buy",
      ts: 1710000000000,
    };
    const t2: TradeMsg = {
      type: "trade",
      id: "t_2",
      price: 102,
      size: 2,
      side: "buy",
      ts: 1710000000300,
    };

    agg.onTrade(t1);
    const candle = agg.onTrade(t2);

    expect(candle.high).toBe(102);
    expect(candle.low).toBe(100);
    expect(candle.close).toBe(102);
    expect(candle.volume).toBe(3);
  });
});
