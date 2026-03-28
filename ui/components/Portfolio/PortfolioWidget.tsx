"use client";

import { useEffect, useRef } from "react";

import { useTradingStore } from "@/store/tradingStore";

export default function PortfolioWidget() {
    const portfolio = useTradingStore((state) => state.portfolio);
    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const pnlFlashRef = useRef<HTMLDivElement | null>(null);
    const equityRef = useRef<HTMLSpanElement | null>(null);
    const previousPnlRef = useRef(0);

    useEffect(() => {
        if (!portfolio || !pnlFlashRef.current) {
            return;
        }

        const next = portfolio.unrealized_pnl + portfolio.realized_pnl;
        const previous = previousPnlRef.current;
        previousPnlRef.current = next;

        pnlFlashRef.current.classList.remove("flash-up", "flash-down");
        if (previous === 0 || next === previous) {
            return;
        }

        pnlFlashRef.current.classList.add(next > previous ? "flash-up" : "flash-down");

        // Equity scale pulse — spec: scale(1.02), 150ms
        if (equityRef.current) {
            const node = equityRef.current;
            node.classList.remove("equity-pulse");
            const raf = window.requestAnimationFrame(() => {
                node.classList.add("equity-pulse");
            });
            return () => window.cancelAnimationFrame(raf);
        }
    }, [portfolio]);

    const unrealizedPnl = portfolio?.unrealized_pnl ?? 0;
    const realizedPnl = portfolio?.realized_pnl ?? 0;
    const positionLabel = (h: number) => (h > 0 ? "LONG" : h < 0 ? "SHORT" : "FLAT");

    return (
        <section className="relative h-full">
            <div className="grid gap-1.5 font-mono text-data-lg">
                <div className="flex items-center justify-between rounded-xs border border-border/70 bg-bg-row px-2 py-1 text-text-muted">
                    <span>Equity</span>
                    <span ref={equityRef} className="text-text-primary">
                        {portfolio ? portfolio.equity.toFixed(2) : "--"}
                    </span>
                </div>
                <div className="flex items-center justify-between rounded-xs border border-border/70 bg-bg-row px-2 py-1 text-text-muted">
                    <span>Cash</span>
                    <span className="text-text-primary">{portfolio ? portfolio.cash.toFixed(2) : "--"}</span>
                </div>
                <div className="flex items-center justify-between rounded-xs border border-border/70 bg-bg-row px-2 py-1 text-text-muted">
                    <span>{portfolio ? positionLabel(portfolio.holdings) : "POS"}</span>
                    <span className="text-text-primary">{portfolio ? portfolio.holdings.toFixed(4) : "--"}</span>
                </div>
                <div className="flex items-center justify-between rounded-xs border border-border/70 bg-bg-row px-2 py-1 text-text-muted">
                    <span>Avg Entry</span>
                    <span className="text-text-primary">
                        {portfolio && portfolio.avg_entry > 0 ? portfolio.avg_entry.toFixed(4) : "--"}
                    </span>
                </div>
                <div
                    ref={pnlFlashRef}
                    className="ticker-flash grid grid-cols-2 gap-1 rounded-xs border border-border/70 bg-bg-row px-2 py-1"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-label text-text-muted">Unreal</span>
                        <span className={unrealizedPnl >= 0 ? "text-bull" : "text-bear"}>
                            {portfolio
                                ? `${unrealizedPnl >= 0 ? "+" : ""}${unrealizedPnl.toFixed(2)}`
                                : "--"}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-label text-text-muted">Real</span>
                        <span className={realizedPnl >= 0 ? "text-bull" : "text-bear"}>
                            {portfolio
                                ? `${realizedPnl >= 0 ? "+" : ""}${realizedPnl.toFixed(2)}`
                                : "--"}
                        </span>
                    </div>
                </div>
            </div>

            {!snapshotReady && (
                <div role="status" aria-live="polite" className="absolute inset-0 flex items-center justify-center bg-bg-panel/80 text-label text-brand/80">
                    Connecting
                </div>
            )}
        </section>
    );
}
