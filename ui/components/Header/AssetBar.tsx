"use client";

import { useEffect, useState } from "react";

import * as sounds from "@/lib/sound";
import { useTradingStore } from "@/store/tradingStore";

type AssetBarProps = {
    priceRef: React.RefObject<HTMLSpanElement | null>;
    priceFlashRef: React.RefObject<HTMLDivElement | null>;
    directionRef: React.RefObject<HTMLSpanElement | null>;
};

export default function AssetBar({ priceRef, priceFlashRef, directionRef }: AssetBarProps) {
    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const changePct = useTradingStore((state) => state.changePct);
    const sessionVolume = useTradingStore((state) => state.sessionVolume);
    const sessionHigh = useTradingStore((state) => state.sessionHigh);
    const sessionLow = useTradingStore((state) => state.sessionLow);
    const connectionStatus = useTradingStore((state) => state.connectionStatus);

    const [muted, setMutedState] = useState(false);

    // Load persisted mute preference after mount (localStorage is client-only)
    useEffect(() => {
        setMutedState(sounds.loadMutePreference());
    }, []);

    const toggleMute = () => {
        const next = !muted;
        sounds.setMuted(next);
        setMutedState(next);
    };

    const isUp = changePct >= 0;
    const statusTone =
        connectionStatus === "open"
            ? "text-bull"
            : connectionStatus === "closed"
              ? "text-bear"
              : "text-text-muted";

    return (
        <header className="h-10 shrink-0 border-b border-border bg-bg-panel px-3">
            <div className="flex h-full items-center justify-between gap-4">
                {/* Left: brand + pair + price */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 border-r border-border pr-3 font-semibold tracking-[0.18em] text-brand">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
                        <span>NEXTBULL</span>
                    </div>

                    <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
                        BULL/USDC
                    </span>

                    <div
                        ref={priceFlashRef}
                        className="ticker-flash flex items-baseline gap-1 rounded-xs border border-border bg-bg-row px-2 py-0.5 font-mono"
                    >
                        <span className="text-[11px] text-text-muted">$</span>
                        <span ref={priceRef} className="text-xl font-semibold text-text-primary">
                            {snapshotReady ? "0.0000" : "—"}
                        </span>
                        <span ref={directionRef} className="text-[13px] text-text-muted" aria-hidden="true" />
                    </div>

                    <span className={`font-mono text-[12px] font-medium ${isUp ? "text-bull" : "text-bear"}`}>
                        {snapshotReady ? `${isUp ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
                    </span>
                </div>

                {/* Center: boot connecting state → live session stats */}
                <div className="hidden items-center md:flex">
                    {snapshotReady ? (
                        // key forces remount on snapshotReady flip → re-triggers stats-reveal animation
                        <div key="live" className="stats-reveal flex items-center gap-4 font-mono text-[11px]">
                            <span className="text-text-muted">
                                H{" "}
                                <span className="text-text-primary">{sessionHigh.toFixed(4)}</span>
                            </span>
                            <span className="text-text-muted">
                                L{" "}
                                <span className="text-text-primary">{sessionLow.toFixed(4)}</span>
                            </span>
                            <span className="text-text-muted">
                                Vol{" "}
                                <span className="text-text-primary">{sessionVolume.toFixed(2)}</span>
                            </span>
                        </div>
                    ) : (
                        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
                            <span className="status-dot inline-block h-1.5 w-1.5 rounded-full bg-text-muted" />
                            Connecting to market
                        </span>
                    )}
                </div>

                {/* Right: mute toggle + status */}
                <div className="flex items-center gap-2">
                    <span className="hidden rounded-xs border border-border bg-bg-row px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-text-muted sm:inline-block">
                        Sim
                    </span>

                    <button
                        type="button"
                        onClick={toggleMute}
                        aria-label={muted ? "Unmute sounds" : "Mute sounds"}
                        aria-pressed={muted}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-xs border border-border bg-bg-row text-text-muted transition-colors duration-100 hover:text-text-primary"
                    >
                        {muted ? (
                            // Speaker with X — muted
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                                <path d="M1.5 3.5H3L5.5 1.5V9.5L3 7.5H1.5V3.5Z" fill="currentColor" />
                                <path d="M8 3.5L10 5.5M10 3.5L8 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                        ) : (
                            // Speaker with wave arc — unmuted
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                                <path d="M1.5 3.5H3L5.5 1.5V9.5L3 7.5H1.5V3.5Z" fill="currentColor" />
                                <path d="M7.5 3C8.5 4 8.5 7 7.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                        )}
                    </button>

                    <span
                        role="status"
                        aria-live="polite"
                        aria-label={`Connection status: ${connectionStatus}`}
                        className={`inline-flex items-center gap-1.5 rounded-xs border border-border bg-bg-row px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${statusTone}`}
                    >
                        <span
                            className={`status-dot inline-block h-1.5 w-1.5 rounded-full ${
                                connectionStatus === "open"
                                    ? "bg-bull"
                                    : connectionStatus === "closed"
                                      ? "bg-bear"
                                      : "bg-text-muted"
                            }`}
                        />
                        {connectionStatus}
                    </span>
                </div>
            </div>
        </header>
    );
}
