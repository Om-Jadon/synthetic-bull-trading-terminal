"use client";

import { useEffect, useMemo, useRef } from "react";

import { useTradingStore } from "@/store/tradingStore";
import type { TradeMsg } from "@/types/ws";

type TradesTableProps = {
    trades: TradeMsg[];
};

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

export default function TradesTable({ trades }: TradesTableProps) {
    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const pauseAutoScrollRef = useRef(false);

    const formattedRows = useMemo(
        () =>
            trades.map((trade, index) => ({
                key: `${trade.id}-${trade.ts}-${index}`,
                side: trade.side,
                rawSize: trade.size,
                price: Number.isFinite(trade.price) ? priceFormatter.format(trade.price) : "-",
                size: Number.isFinite(trade.size) ? sizeFormatter.format(trade.size) : "-",
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
        <div
            ref={containerRef}
            className="panel-scroller top-fade h-full min-h-0 overflow-y-auto overflow-x-hidden"
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
                    className="grid h-full place-items-center px-2 py-3 text-xs uppercase tracking-[0.12em] text-text-muted"
                >
                    Connecting
                </div>
            ) : trades.length === 0 ? (
                <div className="grid h-full place-items-center px-2 py-3 text-xs text-text-muted">
                    Waiting for trades...
                </div>
            ) : (
                <table className="w-full table-fixed border-collapse font-mono text-[12px] tabular-nums">
                    <caption className="sr-only">Recent market trades</caption>
                    <thead className="sticky top-0 z-10 bg-bg-panel">
                        <tr className="border-b border-border/70 text-[10px] uppercase tracking-[0.08em] text-text-muted">
                            <th scope="col" className="px-2 py-1 text-left font-medium">
                                Price
                            </th>
                            <th scope="col" className="px-2 py-1 text-right font-medium">
                                Size
                            </th>
                            <th scope="col" className="px-2 py-1 text-right font-medium">
                                Time
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {formattedRows.map((trade, index) => (
                            <tr key={trade.key} className={`trade-row ${sizeClass(trade.rawSize)} border-b border-border/50 ${index === 0 ? "trade-row-enter" : ""}`}>
                                <td className={`px-2 py-1.5 ${trade.side === "buy" ? "text-bull" : "text-bear"}`}>
                                    {trade.price}
                                </td>
                                <td className="px-2 py-1.5 text-right text-text-primary">{trade.size}</td>
                                <td className="truncate px-2 py-1.5 text-right text-text-muted">{trade.time}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
