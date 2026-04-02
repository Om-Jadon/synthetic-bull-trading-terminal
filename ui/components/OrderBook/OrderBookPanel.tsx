"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import {
    getGroupedMap,
    generateLadder,
    BOOK_TICKS,
    TARGET_ROWS,
} from "@/lib/groupBook";
import { useTradingStore } from "@/store/tradingStore";

import OrderRow from "./OrderRow";
import SpreadRow from "./SpreadRow";

type OrderBookPanelProps = {
    showTitle?: boolean;
    action?: React.ReactNode;
};

export default function OrderBookPanel({ showTitle, action }: OrderBookPanelProps = {}) {
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

    const bestBid = bids[0]?.[0];
    const bestAsk = asks[0]?.[0];

    // Price Ladder Generation
    const { askRows, bidRows, maxTotal } = useMemo(() => {
        const factor = Math.round(1 / bookGroupTick);
        const mid = (bestBid && bestAsk) ? (bestBid + bestAsk) / 2 : (bestBid || bestAsk || 0);
        const roundedMid = Math.round(mid * factor) / factor;

        const bidMap = getGroupedMap(bids, bookGroupTick);
        const askMap = getGroupedMap(asks, bookGroupTick);

        const askLadder = generateLadder(roundedMid, bookGroupTick, TARGET_ROWS, 1).reverse();
        const bidLadder = generateLadder(roundedMid, bookGroupTick, TARGET_ROWS, -1);

        const asksWithTotal = askLadder.reduce<{ price: number; size: number; total: number }[]>((rows, price) => {
            const size = askMap.get(price) || 0;
            const prevTotal = rows.length > 0 ? rows[rows.length - 1].total : 0;
            return [...rows, { price, size, total: prevTotal + size }];
        }, []);

        const bidsWithTotal = bidLadder.reduce<{ price: number; size: number; total: number }[]>((rows, price) => {
            const size = bidMap.get(price) || 0;
            const prevTotal = rows.length > 0 ? rows[rows.length - 1].total : 0;
            return [...rows, { price, size, total: prevTotal + size }];
        }, []);

        const finalAskTotal = asksWithTotal.length > 0 ? asksWithTotal[asksWithTotal.length - 1].total : 0;
        const finalBidTotal = bidsWithTotal.length > 0 ? bidsWithTotal[bidsWithTotal.length - 1].total : 0;
        const mTotal = Math.max(1, finalAskTotal, finalBidTotal);

        return { askRows: asksWithTotal, bidRows: bidsWithTotal, maxTotal: mTotal };
    }, [bids, asks, bestBid, bestAsk, bookGroupTick]);

    const bookEmpty = snapshotReady && askRows.length === 0 && bidRows.length === 0;

    return (
        <section className="panel relative flex h-full min-h-0 flex-col">
            {showTitle && (
                <div className="panel-title flex h-9 shrink-0 items-center justify-between border-b border-border bg-bg-panel px-3 max-sm:px-2">
                    <h2 className="text-label font-medium text-text-primary">Order Book</h2>
                    {action}
                </div>
            )}
            <div className="grid flex-1 min-h-0 grid-rows-[auto_1fr]">
                {/* Column header + group selector */}
                <div className="flex h-7 max-md:h-8 items-center border-b border-border/70 px-2 max-sm:px-1">
                    <div className="grid flex-1 grid-cols-[5fr_3fr_3fr] gap-x-1 text-label text-text-muted">
                        <span>Price</span>
                        <span className="text-right">Size</span>
                        <span className="text-right">Total</span>
                    </div>

                    {/* Premium Grouping Selector */}
                    <div className="relative ml-2" ref={dropdownRef}>
                        <button
                            type="button"
                            onClick={() => setIsGroupOpen(!isGroupOpen)}
                            aria-label="Order book price grouping"
                            aria-haspopup="listbox"
                            aria-expanded={isGroupOpen}
                            className="touch-target-compact flex items-center gap-1 px-1.5 py-0.5 font-mono text-xs font-medium text-text-muted transition-colors hover:text-text-primary"
                        >
                            <span>{bookGroupTick.toFixed(2)}</span>
                            <svg
                                width="10"
                                height="10"
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
                                className="dropdown-enter absolute right-0 top-full z-50 mt-1 min-w-15 rounded-xs border border-border bg-bg-panel p-1 shadow-2xl"
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
                                        className={`touch-target-compact flex w-full items-center justify-end rounded-xs px-2 py-1.5 font-mono text-micro transition-colors ${bookGroupTick === tick
                                            ? "accent-chip-active"
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
                        No orders
                    </div>
                ) : (
                    <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                        {/* Asks — Price Ladder (Higher prices at top) */}
                        <div className="min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
                            <div className="flex flex-col min-h-full">
                                {askRows.map((row: { price: number; size: number; total: number }) => (
                                    <OrderRow
                                        key={`ask-${row.price}`}
                                        side="ask"
                                        price={row.price}
                                        size={row.size}
                                        totalSize={row.total}
                                        depthPct={row.total / Math.max(1, maxTotal)}
                                    />
                                ))}
                            </div>
                        </div>

                        <SpreadRow bestBid={bestBid} bestAsk={bestAsk} />

                        {/* Bids — Price Ladder (Lower prices at bottom) */}
                        <div className="min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
                            <div className="flex flex-col">
                                {bidRows.map((row: { price: number; size: number; total: number }) => (
                                    <OrderRow
                                        key={`bid-${row.price}`}
                                        side="bid"
                                        price={row.price}
                                        size={row.size}
                                        totalSize={row.total}
                                        depthPct={row.total / Math.max(1, maxTotal)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {!snapshotReady && (
                <div role="status" aria-live="polite" className="absolute inset-0 flex items-center justify-center bg-bg-panel/80 text-label text-info">
                    Connecting
                </div>
            )}
        </section>
    );
}
