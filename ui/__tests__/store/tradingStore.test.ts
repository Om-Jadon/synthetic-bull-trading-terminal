import { beforeEach, describe, expect, it } from "vitest";

import { selectVwap, useTradingStore } from "@/store/tradingStore";
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
      vwapNumerator: 0,
      vwapDenominator: 0,
      tradeCount: 0,
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

  describe("VWAP calculation", () => {
    it("accumulates numerator and denominator on trades", () => {
      const store = useTradingStore.getState();
      const t1: TradeMsg = { type: "trade", id: "1", price: 100, size: 2, side: "buy", ts: Date.now() };
      const t2: TradeMsg = { type: "trade", id: "2", price: 110, size: 1, side: "sell", ts: Date.now() };

      store.addTrade(t1);
      store.addTrade(t2);

      const s = useTradingStore.getState();
      expect(s.vwapNumerator).toBe(100 * 2 + 110 * 1); // 310
      expect(s.vwapDenominator).toBe(2 + 1); // 3
      expect(s.tradeCount).toBe(2);
    });

    it("selectVwap computes the correct average", () => {
      useTradingStore.setState({ vwapNumerator: 300, vwapDenominator: 3 });
      const vwap = selectVwap(useTradingStore.getState());
      expect(vwap).toBe(100);
    });

    it("selectVwap returns null when denominator is zero", () => {
      useTradingStore.setState({ vwapNumerator: 0, vwapDenominator: 0 });
      const vwap = selectVwap(useTradingStore.getState());
      expect(vwap).toBeNull();
    });

    it("resets VWAP when snapshotReady is set to false", () => {
      useTradingStore.setState({ vwapNumerator: 500, vwapDenominator: 5, tradeCount: 10, snapshotReady: true });
      
      useTradingStore.getState().setSnapshotReady(false);

      const s = useTradingStore.getState();
      expect(s.vwapNumerator).toBe(0);
      expect(s.vwapDenominator).toBe(0);
      expect(s.tradeCount).toBe(0);
      expect(s.snapshotReady).toBe(false);
    });
  });
});
