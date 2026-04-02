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
      vwap: 0,
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

  it("keeps candles capped to 1200", () => {
    const setCandles = useTradingStore.getState().setCandles;
    const candles = Array.from({ length: 1300 }, (_, i) => ({
      time: i + 1,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1,
    }));

    setCandles(candles);

    expect(useTradingStore.getState().candles).toHaveLength(1200);
    expect(useTradingStore.getState().candles[0].time).toBe(101);
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

  it("hydrates bot portfolios and equity history from snapshot payload", () => {
    const store = useTradingStore.getState();

    store.seedBotSnapshots(
      [
        {
          type: "portfolio",
          user_id: "market_maker",
          cash: 99500,
          holdings: 5,
          avg_entry: 100,
          unrealized_pnl: 10,
          realized_pnl: 20,
          equity: 100010,
          fill_count: 15,
          ts: 1_710_000_002_000,
        },
      ],
      {
        market_maker: [
          { ts: 1_710_000_000_000, value: 100000 },
          { ts: 1_710_000_001_000, value: 100005 },
          { ts: 1_710_000_002_000, value: 100010 },
        ],
      },
    );

    const next = useTradingStore.getState();
    expect(next.botPortfolios.get("market_maker")?.equity).toBe(100010);
    expect(next.botEquityHistory.get("market_maker")?.length).toBe(3);
  });

  describe("VWAP from backend stats", () => {
    it("is 0 initially", () => {
      expect(useTradingStore.getState().vwap).toBe(0);
    });

    it("is set by setStats", () => {
      useTradingStore.getState().setStats({
        type: "stats",
        session_open: 100,
        session_high: 110,
        session_low: 90,
        last_price: 105,
        session_volume: 500,
        change_pct: 5,
        trade_count: 10,
        vwap: 103.5,
        ts: Date.now(),
      });
      expect(useTradingStore.getState().vwap).toBe(103.5);
    });

    it("resets to 0 on disconnect", () => {
      useTradingStore.setState({
        vwap: 103.5,
        tradeCount: 10,
        snapshotReady: true,
      });
      useTradingStore.getState().setSnapshotReady(false);
      const s = useTradingStore.getState();
      expect(s.vwap).toBe(0);
      expect(s.tradeCount).toBe(0);
      expect(s.snapshotReady).toBe(false);
    });
  });
});
