export type BookMsg = {
  type: "book";
  bids: [number, number][];
  asks: [number, number][];
  ts: number;
};

export type TradeMsg = {
  type: "trade";
  id: string;
  price: number;
  size: number;
  side: "buy" | "sell";
  ts: number;
};

export type StatsMsg = {
  type: "stats";
  session_open: number;
  session_high: number;
  session_low: number;
  last_price: number;
  session_volume: number;
  change_pct: number;
  trade_count: number;
  vwap: number;
  ts: number;
};

export type PortfolioMsg = {
  type: "portfolio";
  cash: number;
  holdings: number;
  avg_entry: number;
  unrealized_pnl: number;
  realized_pnl: number;
  equity: number;
  ts: number;
};

export type OrderUpdateMsg = {
  type: "order_update";
  order_id: string;
  status: "open" | "partial" | "filled" | "cancelled";
  filled_size: number;
  remaining_size: number;
  price: number;
  side: "buy" | "sell";
  ts: number;
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type RecentTrade = {
  price: number;
  size: number;
  side: "buy" | "sell";
  ts: number;
};

export type SnapshotMsg = {
  type: "snapshot";
  book: { bids: [number, number][]; asks: [number, number][]; ts: number };
  candles: Candle[] | null;
  portfolio: PortfolioMsg;
  stats: StatsMsg | null;
  recent_trades: RecentTrade[] | null;
  ts: number;
};

export type WSMessage =
  | BookMsg
  | TradeMsg
  | StatsMsg
  | PortfolioMsg
  | OrderUpdateMsg
  | SnapshotMsg;

export type OrderRequest = {
  type: "limit" | "market";
  side: "buy" | "sell";
  price?: number;
  size: number;
};

export type OrderResponse = {
  order_id: string;
  status: "accepted";
};
