import { describe, expect, it } from "vitest";
import type {
  BookMsg,
  Candle,
  TradeMsg,
  StatsMsg,
  PortfolioMsg,
  OrderUpdateMsg,
  SnapshotMsg,
} from "@/types/ws";

describe("WebSocket message shapes", () => {
  it("keeps candle time in seconds", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);

    const candle: Candle = {
      time: nowSeconds,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 10,
    };

    expect(candle.time.toString().length).toBeLessThan(12);
    expect(candle.time).toBe(nowSeconds);
  });

  it("matches book and trade type definitions", () => {
    const book: BookMsg = {
      type: "book",
      bids: [
        [100, 5],
        [99.5, 10],
      ],
      asks: [
        [100.5, 3],
        [101, 7],
      ],
      ts: Date.now(),
    };

    const trade: TradeMsg = {
      type: "trade",
      id: "t_1",
      price: 100.25,
      size: 2,
      side: "buy",
      ts: Date.now(),
    };

    expect(book.type).toBe("book");
    expect(trade.type).toBe("trade");
    expect(trade.side).toMatch(/buy|sell/);
  });

  it("matches status and portfolio type definitions", () => {
    const stats: StatsMsg = {
      type: "stats",
      session_open: 100,
      session_high: 110,
      session_low: 90,
      last_price: 105,
      session_volume: 1000,
      change_pct: 0.05,
      trade_count: 42,
      vwap: 104.5,
      ts: Date.now(),
    };

    const portfolio: PortfolioMsg = {
      type: "portfolio",
      user_id: "human",
      cash: 10000,
      holdings: 50,
      avg_entry: 100,
      unrealized_pnl: 250,
      realized_pnl: 100,
      equity: 15250,
      ts: Date.now(),
    };

    expect(stats.type).toBe("stats");
    expect(portfolio.type).toBe("portfolio");
    expect(portfolio.equity).toBe(
      portfolio.cash + portfolio.holdings * 105 - 10000 + 10000,
    ); // just dummy check
  });

  it("supports bot snapshot hydration fields", () => {
    const snapshot: SnapshotMsg = {
      type: "snapshot",
      book: { bids: [[100, 1]], asks: [[101, 1]], ts: Date.now() },
      candles: [],
      portfolio: {
        type: "portfolio",
        user_id: "human",
        cash: 100000,
        holdings: 0,
        avg_entry: 0,
        unrealized_pnl: 0,
        realized_pnl: 0,
        equity: 100000,
        ts: Date.now(),
      },
      bot_portfolios: [
        {
          type: "portfolio",
          user_id: "market_maker",
          cash: 99900,
          holdings: 1,
          avg_entry: 100,
          unrealized_pnl: 5,
          realized_pnl: 10,
          equity: 100005,
          ts: Date.now(),
        },
      ],
      bot_equity_history: {
        market_maker: [{ ts: Date.now(), value: 100005 }],
      },
      stats: null,
      recent_trades: null,
      equity_history: null,
      fills: null,
      activity_log: null,
      open_orders: null,
      ts: Date.now(),
    };

    expect(snapshot.bot_portfolios?.[0].user_id).toBe("market_maker");
    expect(snapshot.bot_equity_history?.market_maker?.length).toBe(1);
  });

  it("matches order update type definitions", () => {
    const update: OrderUpdateMsg = {
      type: "order_update",
      order_id: "o_1",
      status: "partial",
      filled_size: 5,
      remaining_size: 5,
      price: 100,
      side: "sell",
      ts: Date.now(),
    };

    expect(update.status).toBe("partial");
    expect(update.type).toBe("order_update");
  });
});
