"use client";

import React, { useEffect, useMemo, useRef } from "react";

import { useTradingStore } from "@/store/tradingStore";

const priceFormatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
});

const sizeFormatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
});

type TradesPanelProps = {
    showTitle?: boolean;
    action?: React.ReactNode;
};

export default function TradesPanel({ showTitle, action }: TradesPanelProps = {}) {
    const trades = useTradingStore((state) => state.trades);
    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const pauseAutoScrollRef = useRef(false);

    const formattedRows = useMemo(
        () =>
            trades.map((trade, index) => ({
                key: `${trade.id}-${trade.ts}-${index}`,
                side: trade.side,
                rawSize: trade.size,
                price: Number.isFinite(trade.price) ? priceFormatter.format(trade.price) : "—",
                size: Number.isFinite(trade.size) ? sizeFormatter.format(trade.size) : "—",
                time: Number.isFinite(trade.ts) ? timeFormatter.format(new Date(trade.ts)) : "--:--:--",
            })),
        [trades],
    );

    useEffect(() => {
        if (pauseAutoScrollRef.current) {
            return;
        }
        const node = containerRef.current;
        if (!node) {
            return;
        }
        node.scrollTop = 0;
    }, [formattedRows]);

    const sizeClass = (size: number): string => {
        if (size > 50) return "trade-block";
        if (size >= 20) return "trade-lg";
        if (size >= 5) return "trade-md";
        return "trade-sm";
    };

    return (
        <section className="panel flex h-full min-h-0 flex-col">
            {showTitle && (
                <div className="panel-title flex h-9 shrink-0 items-center justify-between border-b border-border bg-bg-panel px-3 max-sm:px-2">
                    <h2 className="text-label font-medium text-text-primary">Trades</h2>
                    {action}
                </div>
            )}
            <div
                ref={containerRef}
                className="panel-scroller top-fade flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
                aria-busy={!snapshotReady}
                onMouseEnter={() => {
                    pauseAutoScrollRef.current = true;
                }}
                onMouseLeave={() => {
                    pauseAutoScrollRef.current = false;
                }}
            >
                {!snapshotReady ? (
                    <div
                        role="status"
                        aria-live="polite"
                        className="grid h-full place-items-center px-2 py-3 text-label text-brand/80"
                    >
                        Connecting
                    </div>
                ) : trades.length === 0 ? (
                    <div className="grid h-full place-items-center px-2 py-3 text-data text-text-muted">
                        No trades yet
                    </div>
                ) : (
                    <table className="w-full table-fixed border-collapse font-mono text-data tabular-nums">
                        <caption className="sr-only">Recent market trades</caption>
                        <thead className="sticky top-0 z-10 bg-bg-panel">
                            <tr className="border-b border-border/70 text-label text-text-muted">
                                <th scope="col" className="px-2 py-1 text-left font-medium max-sm:px-1">
                                    Price
                                </th>
                                <th scope="col" className="px-2 py-1 text-right font-medium max-sm:px-1">
                                    Size
                                </th>
                                <th scope="col" className="px-2 py-1 text-right font-medium max-sm:hidden max-sm:px-1">
                                    Time
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {formattedRows.map((trade, index) => (
                                <tr key={trade.key} className={`trade-row ${sizeClass(trade.rawSize)} border-b border-border/50 ${index === 0 ? "trade-row-enter" : ""}`}>
                                    <td className={`px-2 py-1.5 max-sm:px-1 max-sm:py-1 ${trade.side === "buy" ? "text-bull" : "text-bear"}`}>
                                        {trade.price}
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-text-primary max-sm:px-1 max-sm:py-1">{trade.size}</td>
                                    <td className="truncate px-2 py-1.5 text-right text-text-muted max-sm:hidden max-sm:px-1 max-sm:py-1">{trade.time}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </section>
    );
}
