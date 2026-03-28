/**
 * groupBook.ts
 * Pure utilities for price-level grouping in the order book.
 * No React dependencies — safe to use in memos and workers.
 */

export const BOOK_TICKS = [0.01, 0.05, 0.10, 0.25, 0.50, 1.00] as const;

export const TARGET_ROWS = 15;

/**
 * Group raw [price, size][] levels into buckets of size `tick`.
 * Sizes within the same bucket are summed.
 * Returns result sorted ascending by price.
 */
export function groupLevels(
    levels: [number, number][],
    tick: number,
): [number, number][] {
    if (!levels.length || tick <= 0) return levels;

    const buckets = new Map<number, number>();
    const factor = Math.round(1 / tick);

    for (const [price, size] of levels) {
        const key = Math.round(price * factor) / factor;
        buckets.set(key, (buckets.get(key) ?? 0) + size);
    }

    return Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
}
