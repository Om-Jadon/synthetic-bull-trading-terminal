import { bench, describe } from "vitest";

import { createCandleAggregator } from "@/lib/candleAggregator";
import { useTradingStore } from "@/store/tradingStore";
import type { OrderBookMsg, OrderUpdateMsg, StatsMsg, TradeMsg } from "@/types/ws";

function makeBook(levels: number): OrderBookMsg {
  const bids: [number, number][] = [];
  const asks: [number, number][] = [];
  for (let i = 0; i < levels; i++) {
    bids.push([100 - i * 0.01, 10]);
    asks.push([100 + i * 0.01, 10]);
  }
  return { type: "book", bids, asks, ts: Date.now() };
}

describe("store update throughput", () => {
  bench("setBidAsks (150 levels)", () => {
    const { setBidAsks } = useTradingStore.getState();
    const book = makeBook(150);
    setBidAsks(book.bids, book.asks);
  });

  bench("addTrade + candle aggregation", () => {
    const { addTrade, upsertCandle } = useTradingStore.getState();
    const aggregator = createCandleAggregator();
    const trade: TradeMsg = {
      type: "trade",
      id: "t_1",
      price: 100 + Math.random(),
      size: 1,
      side: "buy",
      ts: Date.now(),
    };
    addTrade(trade);
    upsertCandle(aggregator.onTrade(trade));
  });

  bench("setStats", () => {
    const { setStats } = useTradingStore.getState();
    const stats: StatsMsg = {
      type: "stats",
      session_open: 100,
      session_high: 101,
      session_low: 99,
      last_price: 100.5,
      session_volume: 12345,
      change_pct: 0.5,
      trade_count: 1000,
      vwap: 100.2,
      ts: Date.now(),
    };
    setStats(stats);
  });

  bench("onOrderUpdate (partial)", () => {
    const { trackOrderId, onOrderUpdate } = useTradingStore.getState();
    trackOrderId("o_bench");
    const update: OrderUpdateMsg = {
      type: "order_update",
      order_id: "o_bench",
      status: "partial",
      filled_size: 1,
      remaining_size: 4,
      price: 100,
      side: "buy",
      ts: Date.now(),
    };
    onOrderUpdate(update);
  });

  bench("book + trade + stats batch", () => {
    const store = useTradingStore.getState();
    const aggregator = createCandleAggregator();
    const book = makeBook(150);
    store.setBidAsks(book.bids, book.asks);
    const trade: TradeMsg = {
      type: "trade",
      id: "t_batch",
      price: 100.25,
      size: 2,
      side: "sell",
      ts: Date.now(),
    };
    store.addTrade(trade);
    store.upsertCandle(aggregator.onTrade(trade));
    store.setStats({
      type: "stats",
      session_open: 100,
      session_high: 101,
      session_low: 99,
      last_price: 100.25,
      session_volume: 500,
      change_pct: 0.25,
      trade_count: 42,
      vwap: 100.1,
      ts: Date.now(),
    });
  });
});
