"use client";

import { useTradingStore } from "@/store/tradingStore";

type SessionStatsProps = {
    variant?: "header" | "fullscreen";
};

export default function SessionStats({ variant = "header" }: SessionStatsProps) {
    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const sessionVolume = useTradingStore((state) => state.sessionVolume);
    const sessionHigh = useTradingStore((state) => state.sessionHigh);
    const sessionLow = useTradingStore((state) => state.sessionLow);
    const vwap = useTradingStore((state) => state.vwap);
    const tradeCount = useTradingStore((state) => state.tradeCount);

    if (!snapshotReady) {
        if (variant === "fullscreen") return null;
        return (
            <span className="flex items-center gap-2 text-label text-text-muted">
                <span className="status-dot inline-block h-1.5 w-1.5 rounded-full bg-brand" />
                Connecting to market
            </span>
        );
    }

    if (variant === "fullscreen") {
        return (
            <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-xs border border-border bg-bg-panel/85 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
                H <span className="text-text-primary">{sessionHigh.toFixed(4)}</span>
                <span className="mx-2 text-border">|</span>
                L <span className="text-text-primary">{sessionLow.toFixed(4)}</span>
                <span className="mx-2 text-border">|</span>
                VWAP <span className="text-text-primary">{vwap > 0 ? vwap.toFixed(4) : "—"}</span>
                <span className="mx-2 text-border">|</span>
                Trades <span className="text-text-primary">{tradeCount.toLocaleString()}</span>
            </div>
        );
    }

    return (
        <div key="live" className="stats-reveal flex items-center gap-3 sm:gap-4 text-data text-text-muted">
            <span className="text-text-muted">
                H <span className="text-text-primary">{sessionHigh.toFixed(4)}</span>
            </span>
            <span className="text-text-muted">
                L <span className="text-text-primary">{sessionLow.toFixed(4)}</span>
            </span>
            <span className="text-text-muted">
                VWAP <span className="text-text-primary">{vwap > 0 ? vwap.toFixed(4) : "—"}</span>
            </span>
            <span className="text-text-muted">
                Vol <span className="text-text-primary">{sessionVolume.toFixed(2)}</span>
            </span>
            <span className="text-text-muted">
                Trades <span className="text-text-primary">{tradeCount.toLocaleString()}</span>
            </span>
        </div>
    );
}
