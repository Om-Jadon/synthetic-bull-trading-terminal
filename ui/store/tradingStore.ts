import { create } from "zustand";

import type {
  Candle,
  OrderUpdateMsg,
  PortfolioMsg,
  StatsMsg,
  TradeMsg,
} from "@/types/ws";

type TradingStore = {
  bids: [number, number][];
  asks: [number, number][];
  trades: TradeMsg[];
  candles: Candle[];
  lastPrice: number;
  changePct: number;
  sessionHigh: number;
  sessionLow: number;
  sessionVolume: number;
  portfolio: PortfolioMsg | null;
  openOrders: Map<string, OrderUpdateMsg>;
  orderHistory: OrderUpdateMsg[];
  knownOrderIds: Set<string>;
  snapshotReady: boolean;
  connectionStatus: "connecting" | "open" | "closed";
  setConnectionStatus: (status: TradingStore["connectionStatus"]) => void;
  setSnapshotReady: (ready: boolean) => void;
  setBidAsks: (bids: [number, number][], asks: [number, number][]) => void;
  addTrade: (trade: TradeMsg) => void;
  setCandles: (candles: Candle[]) => void;
  upsertCandle: (candle: Candle) => void;
  setStats: (stats: StatsMsg) => void;
  setPortfolio: (portfolio: PortfolioMsg) => void;
  trackOrderId: (orderId: string) => void;
  onOrderUpdate: (update: OrderUpdateMsg) => void;
};

export const useTradingStore = create<TradingStore>((set, get) => ({
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

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  setSnapshotReady: (snapshotReady) => set({ snapshotReady }),

  setBidAsks: (bids, asks) => set({ bids, asks }),

  addTrade: (trade) =>
    set((state) => ({
      trades: [trade, ...state.trades].slice(0, 50),
    })),

  setCandles: (candles) => set({ candles: candles.slice(-300) }),

  upsertCandle: (candle) =>
    set((state) => {
      if (state.candles.length === 0) {
        return { candles: [candle] };
      }

      const next = [...state.candles];
      const last = next[next.length - 1];
      if (last.time === candle.time) {
        next[next.length - 1] = candle;
      } else {
        next.push(candle);
      }

      return { candles: next.slice(-300) };
    }),

  setStats: (stats) =>
    set({
      lastPrice: stats.last_price,
      changePct: stats.change_pct,
      sessionHigh: stats.session_high,
      sessionLow: stats.session_low,
      sessionVolume: stats.session_volume,
    }),

  setPortfolio: (portfolio) => set({ portfolio }),

  trackOrderId: (orderId) =>
    set((state) => {
      const known = new Set(state.knownOrderIds);
      known.add(orderId);
      return { knownOrderIds: known };
    }),

  onOrderUpdate: (update) => {
    const state = get();
    if (!state.knownOrderIds.has(update.order_id)) {
      return;
    }

    set((curr) => {
      const openOrders = new Map(curr.openOrders);
      if (update.status === "filled" || update.status === "cancelled") {
        openOrders.delete(update.order_id);
      } else {
        openOrders.set(update.order_id, update);
      }

      return {
        openOrders,
        orderHistory: [update, ...curr.orderHistory].slice(0, 200),
      };
    });
  },
}));
