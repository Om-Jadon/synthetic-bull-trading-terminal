import { describe, expect, it } from "vitest";

describe("WebSocket message shapes", () => {
  it("keeps candle time in seconds", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);

    const candle = {
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

  it("matches book and trade examples", () => {
    const book = {
      type: "book" as const,
      bids: [[100, 5]] as [number, number][],
      asks: [[100.5, 3]] as [number, number][],
      ts: Date.now(),
    };

    const trade = {
      type: "trade" as const,
      id: "t_1",
      price: 100.25,
      size: 2,
      side: "buy" as const,
      ts: Date.now(),
    };

    expect(book.type).toBe("book");
    expect(trade.type).toBe("trade");
    expect(trade.side).toMatch(/buy|sell/);
  });
});
