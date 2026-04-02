/**
 * groupBook.ts
 * Pure utilities for price-level grouping and ladder generation.
 */

export const BOOK_TICKS = [0.01, 0.05, 0.10, 0.25, 0.50, 1.00] as const;

export const TARGET_ROWS = 20; // Increased for a more immersive ladder

/**
 * Group raw [price, size][] into a Map for fast lookup by bucket.
 */
export function getGroupedMap(
    levels: [number, number][],
    tick: number,
): Map<number, number> {
    const buckets = new Map<number, number>();
    if (!levels.length || tick <= 0) return buckets;

    const factor = Math.round(1 / tick);
    for (const [price, size] of levels) {
        const key = Math.round(price * factor) / factor;
        buckets.set(key, (buckets.get(key) ?? 0) + size);
    }
    return buckets;
}

/**
 * Generate a continuous sequence of prices starting from a base.
 */
export function generateLadder(
    startPrice: number,
    tick: number,
    count: number,
    direction: 1 | -1,
): number[] {
    const prices: number[] = [];
    for (let i = 1; i <= count; i++) {
        prices.push(startPrice + i * tick * direction);
    }
    return prices;
}

