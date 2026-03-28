"use client";

import { useMemo } from "react";

import { groupLevels, BOOK_TICKS, TARGET_ROWS } from "@/lib/groupBook";
import { useTradingStore } from "@/store/tradingStore";

import OrderRow from "./OrderRow";
import SpreadRow from "./SpreadRow";

function cumulativeRows(levels: [number, number][]) {
    let running = 0;
    return levels.map(([price, size]) => {
        running += size;
        return { price, size, total: running };
    });
}

export default function OrderBookPanel() {
    const bids = useTradingStore((state) => state.bids);
    const asks = useTradingStore((state) => state.asks);
    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const bookGroupTick = useTradingStore((state) => state.bookGroupTick);
    const setBookGroupTick = useTradingStore((state) => state.setBookGroupTick);

    const bidRows = useMemo(
        () => cumulativeRows(groupLevels(bids, bookGroupTick).slice(0, TARGET_ROWS)),
        [bids, bookGroupTick],
    );
    const askRows = useMemo(
        () => cumulativeRows(groupLevels(asks, bookGroupTick).slice(0, TARGET_ROWS)).reverse(),
        [asks, bookGroupTick],
    );
    const maxTotal = useMemo(() => {
        const bidMax = bidRows.length ? bidRows[bidRows.length - 1].total : 1;
        const askMax = askRows.length ? askRows[0].total : 1;
        return Math.max(1, bidMax, askMax);
    }, [askRows, bidRows]);

    const bestBid = bids[0]?.[0];
    const bestAsk = asks[0]?.[0];

    const bookEmpty = snapshotReady && askRows.length === 0 && bidRows.length === 0;

    return (
        <section className="panel relative flex h-full min-h-0 flex-col">
            <div className="grid h-full min-h-0 grid-rows-[auto_1fr]">
                {/* Column header + group selector */}
                <div className="flex h-7 items-center border-b border-border/70 px-2">
                    <div className="grid flex-1 grid-cols-3 text-label text-text-muted">
                        <span>Price</span>
                        <span className="text-right">Size</span>
                        <span className="text-right">Total</span>
                    </div>
                    <label className="ml-2 flex shrink-0 items-center gap-0.5 font-mono text-[10px] text-text-muted/70">
                        <span className="hidden sm:inline">Grp</span>
                        <select
                            id="book-group-tick"
                            value={bookGroupTick}
                            onChange={(e) => setBookGroupTick(Number(e.target.value))}
                            className="cursor-pointer appearance-none border-none bg-transparent font-mono text-[10px] text-text-muted outline-none transition-colors hover:text-text-primary focus-visible:outline-none"
                            aria-label="Order book minimum grouping"
                        >
                            {BOOK_TICKS.map((tick) => (
                                <option key={tick} value={tick}>
                                    {tick.toFixed(2)}
                                </option>
                            ))}
                        </select>
                        <span className="pointer-events-none text-text-muted/50">▾</span>
                    </label>
                </div>

                {bookEmpty ? (
                    <div role="status" aria-live="polite" className="grid flex-1 place-items-center px-2 py-3 text-label text-text-muted">
                        Book Empty
                    </div>
                ) : (
                    <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                        {/* Asks — fixed-height rows, packed to the bottom (closest to spread) */}
                        <div className="min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
                            <div className="flex flex-col justify-end min-h-full">
                                {askRows.map((row, i) => (
                                    <OrderRow
                                        key={`ask-${row.price}`}
                                        side="ask"
                                        price={row.price}
                                        size={row.size}
                                        totalSize={row.total}
                                        depthPct={row.total / Math.max(1, maxTotal)}
                                        isBest={i === askRows.length - 1}
                                    />
                                ))}
                            </div>
                        </div>

                        <SpreadRow bestBid={bestBid} bestAsk={bestAsk} />

                        {/* Bids — fixed-height rows, packed to the top (closest to spread) */}
                        <div className="min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
                            <div className="flex flex-col justify-start">
                                {bidRows.map((row, i) => (
                                    <OrderRow
                                        key={`bid-${row.price}`}
                                        side="bid"
                                        price={row.price}
                                        size={row.size}
                                        totalSize={row.total}
                                        depthPct={row.total / Math.max(1, maxTotal)}
                                        isBest={i === 0}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {!snapshotReady && (
                <div role="status" aria-live="polite" className="absolute inset-0 flex items-center justify-center bg-bg-panel/80 text-label text-brand/80">
                    Connecting
                </div>
            )}
        </section>
    );
}
