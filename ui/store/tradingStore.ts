import { create } from "zustand";
import type { UTCTimestamp } from "lightweight-charts";

import type {
  Candle,
  OrderUpdateMsg,
  PortfolioMsg,
  StatsMsg,
  TradeMsg,
} from "@/types/ws";

type TradingStore = {
  fills: FillMarker[];
  equityHistory: EquityPoint[];
  activeTool: "none" | "line";
  drawings: DrawingLine[];
  chartFullscreen: boolean;
  bids: [number, number][];
  asks: [number, number][];
  trades: TradeMsg[];
  candles: Candle[];
  chartTimeframe: number; // seconds; 1s candles are the base
  vwapNumerator: number;
  vwapDenominator: number;
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
  connectionStatus: "connecting" | "open" | "closed";
  wsStats: { msgsPerSec: number; latencyMs: number };
  setConnectionStatus: (status: TradingStore["connectionStatus"]) => void;
  setSnapshotReady: (ready: boolean) => void;
  setWsStats: (stats: { msgsPerSec: number; latencyMs: number }) => void;
  setChartTimeframe: (seconds: number) => void;
  setBidAsks: (bids: [number, number][], asks: [number, number][]) => void;
  addTrade: (trade: TradeMsg) => void;
  setCandles: (candles: Candle[]) => void;
  upsertCandle: (candle: Candle) => void;
  setStats: (stats: StatsMsg) => void;
  setPortfolio: (portfolio: PortfolioMsg) => void;
  setActiveTool: (tool: TradingStore["activeTool"]) => void;
  addDrawing: (drawing: DrawingLine) => void;
  clearDrawings: () => void;
  toggleChartFullscreen: () => void;
  trackOrderId: (orderId: string) => void;
  onOrderUpdate: (update: OrderUpdateMsg) => void;
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

type DrawingLine = {
  id: string;
  price: number;
};

function toUtcTimestamp(ts: number): UTCTimestamp {
  const seconds =
    ts > 1_000_000_000_000 ? Math.floor(ts / 1000) : Math.floor(ts);
  return seconds as UTCTimestamp;
}

export const useTradingStore = create<TradingStore>((set, get) => ({
  fills: [],
  equityHistory: [],
  activeTool: "none",
  drawings: [],
  chartFullscreen: false,
  bids: [],
  asks: [],
  trades: [],
  candles: [],
  chartTimeframe: 1,
  vwapNumerator: 0,
  vwapDenominator: 0,
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
  connectionStatus: "connecting",
  wsStats: { msgsPerSec: 0, latencyMs: 0 },

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  setWsStats: (wsStats) => set({ wsStats }),

  setSnapshotReady: (snapshotReady) =>
    set((state) =>
      snapshotReady
        ? { snapshotReady }
        : {
            snapshotReady,
            fills: [],
            equityHistory: [],
            drawings: [],
            activeTool: "none",
            chartFullscreen: false,
            vwapNumerator: 0,
            vwapDenominator: 0,
            tradeCount: 0,
          },
    ),

  setChartTimeframe: (chartTimeframe) => set({ chartTimeframe }),

  setBidAsks: (bids, asks) => set({ bids, asks }),

  addTrade: (trade) =>
    set((state) => ({
      trades: [trade, ...state.trades].slice(0, 50),
      vwapNumerator: state.vwapNumerator + trade.price * trade.size,
      vwapDenominator: state.vwapDenominator + trade.size,
      tradeCount: state.tradeCount + 1,
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

  setActiveTool: (activeTool) => set({ activeTool }),

  addDrawing: (drawing) =>
    set((state) => ({ drawings: [...state.drawings, drawing].slice(-80) })),

  clearDrawings: () => set({ drawings: [] }),

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
}));
