export function estimateMarketFill(
  side: "buy" | "sell",
  size: number,
  asks: [number, number][],
  bids: [number, number][],
  lastPrice: number,
): {
  avgPrice: number;
  slippage: number;
  levelsUsed: number;
  partial: boolean;
} | null {
  if (!(size > 0)) return null;
  const levels = side === "buy" ? asks : bids;
  if (levels.length === 0) return null;

  let remaining = size;
  let totalCost = 0;
  let levelsUsed = 0;

  for (const [price, volume] of levels) {
    if (remaining <= 0) break;
    if (!(volume > 0)) continue;
    const fill = Math.min(remaining, volume);
    totalCost += price * fill;
    remaining -= fill;
    levelsUsed += 1;
  }

  const filled = size - remaining;
  if (filled <= 0) return null;

  const avgPrice = totalCost / filled;
  const refPrice = lastPrice > 0 ? lastPrice : avgPrice;
  const slippage =
    refPrice > 0 ? (Math.abs(avgPrice - refPrice) / refPrice) * 100 : 0;

  return { avgPrice, slippage, levelsUsed, partial: remaining > 0 };
}
