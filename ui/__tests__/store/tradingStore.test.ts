import { beforeEach, describe, expect, it } from "vitest";

import { useTradingStore } from "@/store/tradingStore";
import type { OrderUpdateMsg, TradeMsg } from "@/types/ws";

describe("tradingStore", () => {
  beforeEach(() => {
    useTradingStore.setState({
      bids: [],
      asks: [],
      trades: [],
      candles: [],
      lastPrice: 0,
      changePct: 0,
      sessionHigh: 0,
      sessionLow: 0,
      sessionVolume: 0,
      portfolio: null,
      openOrders: new Map(),
      orderHistory: [],
      knownOrderIds: new Set(),
      snapshotReady: false,
      connectionStatus: "connecting",
    });
  });

  it("keeps trades capped to 50", () => {
    const addTrade = useTradingStore.getState().addTrade;

    for (let i = 0; i < 60; i += 1) {
      const trade: TradeMsg = {
        type: "trade",
        id: `t_${i}`,
        price: 100 + i,
        size: 1,
        side: "buy",
        ts: Date.now() + i,
      };
      addTrade(trade);
    }

    expect(useTradingStore.getState().trades).toHaveLength(50);
    expect(useTradingStore.getState().trades[0].id).toBe("t_59");
  });

  it("filters order updates to known order ids", () => {
    const store = useTradingStore.getState();
    store.trackOrderId("o_1");

    const update: OrderUpdateMsg = {
      type: "order_update",
      order_id: "o_1",
      status: "open",
      filled_size: 0,
      remaining_size: 2,
      price: 101,
      side: "buy",
      ts: Date.now(),
    };

    const unknown: OrderUpdateMsg = {
      ...update,
      order_id: "o_unknown",
    };

    store.onOrderUpdate(unknown);
    expect(useTradingStore.getState().openOrders.size).toBe(0);

    store.onOrderUpdate(update);
    expect(useTradingStore.getState().openOrders.size).toBe(1);
  });
});
