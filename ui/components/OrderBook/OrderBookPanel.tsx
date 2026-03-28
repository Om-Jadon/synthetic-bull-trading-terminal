"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

    const [isGroupOpen, setIsGroupOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsGroupOpen(false);
            }
        }
        if (isGroupOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isGroupOpen]);

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

                    {/* Premium Grouping Selector */}
                    <div className="relative ml-2" ref={dropdownRef}>
                        <button
                            type="button"
                            onClick={() => setIsGroupOpen(!isGroupOpen)}
                            aria-label="Grouping selector"
                            aria-haspopup="listbox"
                            aria-expanded={isGroupOpen}
                            className="flex items-center gap-1 py-0.5 font-mono text-[10px] font-medium text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none"
                        >
                            <span>{bookGroupTick.toFixed(2)}</span>
                            <svg
                                width="8"
                                height="8"
                                viewBox="0 0 8 8"
                                fill="none"
                                className={`transition-transform duration-200 text-text-muted/50 ${isGroupOpen ? "rotate-180" : ""}`}
                                aria-hidden="true"
                            >
                                <path d="M1 3L4 6L7 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>

                        {isGroupOpen && (
                            <div
                                className="palette-enter absolute right-0 top-full z-50 mt-1 min-w-[60px] rounded-[2px] border border-border bg-bg-panel p-1 shadow-2xl"
                                role="listbox"
                            >
                                {BOOK_TICKS.map((tick) => (
                                    <button
                                        key={tick}
                                        type="button"
                                        role="option"
                                        aria-selected={bookGroupTick === tick}
                                        onClick={() => {
                                            setBookGroupTick(tick);
                                            setIsGroupOpen(false);
                                        }}
                                        className={`flex w-full items-center justify-end rounded-xs px-2 py-1.5 font-mono text-[10px] transition-colors ${
                                            bookGroupTick === tick
                                                ? "bg-brand/10 text-brand font-semibold"
                                                : "text-text-muted hover:bg-bg-row hover:text-text-primary"
                                        }`}
                                    >
                                        {tick.toFixed(2)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
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
                                {askRows.map((row: { price: number; size: number; total: number }, i: number) => (
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
                                {bidRows.map((row: { price: number; size: number; total: number }, i: number) => (
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
