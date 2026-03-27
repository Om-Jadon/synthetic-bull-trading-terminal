"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type RenderRow = {
    price: number;
    size: number;
    total: number;
    depthPct: number;
    exiting?: boolean;
};

function syncRows(previous: RenderRow[], nextBase: { price: number; size: number; total: number }[], maxTotal: number): RenderRow[] {
    const byPrice = new Map(nextBase.map((row) => [row.price, row]));

    const nextRows: RenderRow[] = nextBase.map((row) => ({
        ...row,
        depthPct: row.total / Math.max(1, maxTotal),
        exiting: false,
    }));

    for (const row of previous) {
        if (!byPrice.has(row.price) && !row.exiting) {
            nextRows.push({ ...row, exiting: true });
        }
    }

    nextRows.sort((a, b) => b.price - a.price);
    return nextRows;
}

export default function OrderBookPanel() {
    const bids = useTradingStore((state) => state.bids);
    const asks = useTradingStore((state) => state.asks);
    const snapshotReady = useTradingStore((state) => state.snapshotReady);

    const [renderBidRows, setRenderBidRows] = useState<RenderRow[]>([]);
    const [renderAskRows, setRenderAskRows] = useState<RenderRow[]>([]);
    const removeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const bidRows = useMemo(() => cumulativeRows(bids.slice(0, 15)), [bids]);
    const askRows = useMemo(() => cumulativeRows(asks.slice(0, 15)).reverse(), [asks]);
    const maxTotal = useMemo(() => {
        const bidMax = bidRows.length ? bidRows[bidRows.length - 1].total : 1;
        const askMax = askRows.length ? askRows[0].total : 1;
        return Math.max(1, bidMax, askMax);
    }, [askRows, bidRows]);

    const bestBid = bids[0]?.[0];
    const bestAsk = asks[0]?.[0];
    const bookEmpty =
        snapshotReady &&
        bidRows.length === 0 &&
        askRows.length === 0 &&
        renderBidRows.length === 0 &&
        renderAskRows.length === 0;

    useEffect(() => {
        return () => {
            for (const timer of removeTimersRef.current.values()) {
                clearTimeout(timer);
            }
            removeTimersRef.current.clear();
        };
    }, []);

    useEffect(() => {
        setRenderAskRows((prev) => syncRows(prev, askRows, maxTotal));
    }, [askRows, maxTotal]);

    useEffect(() => {
        setRenderBidRows((prev) => syncRows(prev, bidRows, maxTotal));
    }, [bidRows, maxTotal]);

    useEffect(() => {
        const timers = removeTimersRef.current;
        const rows = [...renderAskRows, ...renderBidRows];
        for (const row of rows) {
            const key = `${row.price}`;
            if (!row.exiting) {
                const existing = timers.get(key);
                if (existing) {
                    clearTimeout(existing);
                    timers.delete(key);
                }
                continue;
            }
            if (timers.has(key)) continue;

            const timer = setTimeout(() => {
                setRenderAskRows((curr) => curr.filter((r) => !(r.exiting && r.price === row.price)));
                setRenderBidRows((curr) => curr.filter((r) => !(r.exiting && r.price === row.price)));
                timers.delete(key);
            }, 100);
            timers.set(key, timer);
        }
    }, [renderAskRows, renderBidRows]);
    return (
        <section className="panel relative flex h-full min-h-0 flex-col">
        <div className="grid h-full min-h-0 grid-rows-[auto_1fr]">
                <div className="grid h-6 grid-cols-3 items-center border-b border-border/70 px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
                    <span>Price</span>
                    <span className="text-right">Size</span>
                    <span className="text-right">Total</span>
                </div>

                {bookEmpty ? (
                    <div
                        role="status"
                        aria-live="polite"
                        className="grid flex-1 place-items-center px-2 py-3 text-xs uppercase tracking-[0.12em] text-text-muted"
                    >
                        Book Empty
                    </div>
                ) : (
                    <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                        <div className="panel-scroller top-fade min-h-0 overflow-y-auto overflow-x-hidden">
                            <div className="flex min-h-full flex-col justify-end py-1">
                                {renderAskRows.map((row, i) => (
                                    <OrderRow
                                        key={`ask-${row.price}`}
                                        side="ask"
                                        price={row.price}
                                        size={row.size}
                                        totalSize={row.total}
                                        depthPct={row.depthPct}
                                        exiting={row.exiting}
                                        isBest={i === renderAskRows.length - 1}
                                    />
                                ))}
                            </div>
                        </div>

                        <SpreadRow bestBid={bestBid} bestAsk={bestAsk} />

                        <div className="panel-scroller min-h-0 overflow-y-auto overflow-x-hidden">
                            <div className="flex min-h-full flex-col justify-start py-1">
                                {renderBidRows.map((row, i) => (
                                    <OrderRow
                                        key={`bid-${row.price}`}
                                        side="bid"
                                        price={row.price}
                                        size={row.size}
                                        totalSize={row.total}
                                        depthPct={row.depthPct}
                                        exiting={row.exiting}
                                        isBest={i === 0}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {!snapshotReady && (
                <div role="status" aria-live="polite" className="absolute inset-0 flex items-center justify-center bg-bg-panel/80 text-[10px] uppercase tracking-[0.12em] text-text-muted">
                    Connecting
                </div>
            )}
        </section>
    );
}
