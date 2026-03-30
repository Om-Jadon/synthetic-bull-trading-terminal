import { create } from "zustand";
import type { UTCTimestamp } from "lightweight-charts";

import type {
  Candle,
  OrderUpdateMsg,
  PortfolioMsg,
  StatsMsg,
  TradeMsg,
  WsEquityPoint,
  WsFillRecord,
  WsActivityRecord,
} from "@/types/ws";

export type BookMode = "tab" | "stacked" | "large";

export type Toast = {
  id: number;
  message: string;
  ok: boolean;
};

type TradingStore = {
  fills: FillMarker[];
  equityHistory: EquityPoint[];
  chartFullscreen: boolean;
  bids: [number, number][];
  asks: [number, number][];
  trades: TradeMsg[];
  candles: Candle[];
  chartTimeframe: number; // seconds; 1s candles are the base
  vwap: number;
  tradeCount: number;
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
  isHelpOpen: boolean;
  connectionStatus: "connecting" | "open" | "closed";
  wsStats: { msgsPerSec: number; latencyMs: number };
  bookGroupTick: number;
  bookMode: BookMode;
  toasts: Toast[];
  pendingPriceFill: { price: number; side: "buy" | "sell" } | null;
  setConnectionStatus: (status: TradingStore["connectionStatus"]) => void;
  setSnapshotReady: (ready: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setWsStats: (stats: { msgsPerSec: number; latencyMs: number }) => void;
  setBookGroupTick: (tick: number) => void;
  setBookMode: (mode: BookMode) => void;
  setChartTimeframe: (seconds: number) => void;
  addToast: (message: string, ok: boolean) => void;
  removeToast: (id: number) => void;
  setBidAsks: (bids: [number, number][], asks: [number, number][]) => void;
  addTrade: (trade: TradeMsg) => void;
  setTrades: (trades: TradeMsg[]) => void;
  setEquityHistory: (points: WsEquityPoint[]) => void;
  setFills: (fills: WsFillRecord[]) => void;
  setOrderHistory: (records: WsActivityRecord[]) => void;
  setCandles: (candles: Candle[]) => void;
  upsertCandle: (candle: Candle) => void;
  setStats: (stats: StatsMsg) => void;
  setPortfolio: (portfolio: PortfolioMsg) => void;
  toggleChartFullscreen: () => void;
  trackOrderId: (orderId: string) => void;
  onOrderUpdate: (update: OrderUpdateMsg) => void;
  setPendingPriceFill: (price: number, side: "buy" | "sell") => void;
};

type FillMarker = {
  time: UTCTimestamp;
  price: number;
  side: "buy" | "sell";
};

type EquityPoint = {
  time: UTCTimestamp;
  value: number;
};

function toUtcTimestamp(ts: number): UTCTimestamp {
  const seconds =
    ts > 1_000_000_000_000 ? Math.floor(ts / 1000) : Math.floor(ts);
  return seconds as UTCTimestamp;
}

const LS_KEYS = {
  bookGroupTick: "nb_bookGroupTick",
  bookMode: "nb_bookMode",
  chartTimeframe: "nb_chartTimeframe",
} as const;

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

let toastSeq = 0;

export const useTradingStore = create<TradingStore>((set, get) => ({
  fills: [],
  equityHistory: [],
  chartFullscreen: false,
  bids: [],
  asks: [],
  trades: [],
  candles: [],
  chartTimeframe: lsGet(LS_KEYS.chartTimeframe, 1),
  vwap: 0,
  tradeCount: 0,
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
  isHelpOpen: false,
  connectionStatus: "connecting",
  wsStats: { msgsPerSec: 0, latencyMs: 0 },
  bookGroupTick: lsGet(LS_KEYS.bookGroupTick, 0.01),
  bookMode: lsGet<BookMode>(LS_KEYS.bookMode, "tab"),
  toasts: [],
  pendingPriceFill: null,

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  setWsStats: (wsStats) => set({ wsStats }),

  setBookGroupTick: (bookGroupTick) => {
    lsSet(LS_KEYS.bookGroupTick, bookGroupTick);
    set({ bookGroupTick });
  },

  setBookMode: (bookMode) => {
    lsSet(LS_KEYS.bookMode, bookMode);
    set({ bookMode });
  },

  setHelpOpen: (isHelpOpen) => set({ isHelpOpen }),

  addToast: (message, ok) => {
    const id = ++toastSeq;
    set((state) => ({ toasts: [...state.toasts, { id, message, ok }] }));
    setTimeout(() => get().removeToast(id), 3000);
  },

  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  setSnapshotReady: (snapshotReady) =>
    set((state) =>
      snapshotReady
        ? { snapshotReady }
        : {
            snapshotReady,
            fills: [],
            equityHistory: [],
            chartFullscreen: false,
            isHelpOpen: false,
            tradeCount: 0,
            vwap: 0,
            openOrders: new Map(),
            knownOrderIds: new Set(),
          },
    ),

  setChartTimeframe: (chartTimeframe) => {
    lsSet(LS_KEYS.chartTimeframe, chartTimeframe);
    set({ chartTimeframe });
  },

  setBidAsks: (bids, asks) => set({ bids, asks }),

  addTrade: (trade) =>
    set((state) => ({
      trades: [trade, ...state.trades].slice(0, 50),
    })),

  setTrades: (trades) => set({ trades }),

  setEquityHistory: (points) =>
    set({
      equityHistory: points.map((p) => ({
        time: toUtcTimestamp(p.ts),
        value: p.value,
      })),
    }),

  setFills: (fills) =>
    set({
      fills: fills.map((f) => ({
        time: toUtcTimestamp(f.ts),
        price: f.price,
        side: f.side,
      })),
    }),

  setOrderHistory: (records) =>
    set({
      orderHistory: records.map((r) => ({
        type: "order_update" as const,
        order_id: r.order_id,
        status: r.status,
        filled_size: r.filled_size,
        remaining_size: r.remaining_size,
        price: r.price,
        side: r.side,
        ts: r.ts,
      })),
    }),

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
      tradeCount: stats.trade_count,
      vwap: stats.vwap,
    }),

  setPortfolio: (portfolio) =>
    set((state) => {
      const point = {
        time: toUtcTimestamp(portfolio.ts),
        value: portfolio.equity,
      };

      let equityHistory: EquityPoint[];
      const last = state.equityHistory[state.equityHistory.length - 1];
      if (last && last.time === point.time) {
        equityHistory = [...state.equityHistory.slice(0, -1), point];
      } else {
        equityHistory = [...state.equityHistory, point];
      }

      return {
        portfolio,
        equityHistory: equityHistory.slice(-600),
      };
    }),


  toggleChartFullscreen: () =>
    set((state) => ({ chartFullscreen: !state.chartFullscreen })),

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
        // "open" and "partial" keep the order in the active map over time, overwriting the old state since remaining_size may change.
        openOrders.set(update.order_id, update);
      }

      const fallbackFillPrice =
        update.price > 0
          ? update.price
          : (curr.trades[0]?.price ?? curr.lastPrice);

      return {
        openOrders,
        orderHistory: [update, ...curr.orderHistory].slice(0, 200),
        fills:
          update.status === "filled" && fallbackFillPrice > 0
            ? [
                ...curr.fills,
                {
                  time: toUtcTimestamp(update.ts),
                  price: fallbackFillPrice,
                  side: update.side,
                },
              ].slice(-200)
            : curr.fills,
      };
    });
  },
  setPendingPriceFill: (price, side) => set({ pendingPriceFill: { price, side } }),
}));

