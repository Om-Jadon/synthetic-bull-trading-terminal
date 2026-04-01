"use client";

import { useState } from "react";

import * as sounds from "@/lib/sound";
import { useTradingStore } from "@/store/tradingStore";
import BotButton from "@/components/Bots/BotButton";
import SessionStats from "./SessionStats";

type AssetBarProps = {
    priceRef: React.RefObject<HTMLSpanElement | null>;
    priceFlashRef: React.RefObject<HTMLDivElement | null>;
    directionRef: React.RefObject<HTMLSpanElement | null>;
};

export default function AssetBar({ priceRef, priceFlashRef, directionRef }: AssetBarProps) {
    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const changePct = useTradingStore((state) => state.changePct);
    const connectionStatus = useTradingStore((state) => state.connectionStatus);
    const wsStats = useTradingStore((state) => state.wsStats);

    const [muted, setMutedState] = useState(() => sounds.loadMutePreference());

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
        <header className="h-auto shrink-0 border-b border-border bg-bg-panel" role="banner">
            {/* ── Tier 1: Brand + Price + Change ── */}
            <div className="flex h-10 items-center justify-between gap-2 sm:gap-4 border-b border-border px-2 sm:px-3">
                {/* Left: wordmark + pair + live price */}
                <div className="flex items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-1.5 border-r border-border pr-3 font-semibold tracking-[0.18em] text-brand">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
                        <span>SYNTHETIC-BULL</span>
                    </div>

                    <span className="text-label text-text-muted">
                        BULL/USDC
                    </span>

                    <div
                        ref={priceFlashRef}
                        className="ticker-flash flex items-baseline gap-1 rounded-xs border border-border bg-bg-row px-2 py-0.5 font-mono"
                    >
                        <span className="text-label text-text-muted">$</span>
                        <span ref={priceRef} className="text-heading-lg max-sm:text-heading text-text-primary">
                            {snapshotReady ? "0.0000" : "—"}
                        </span>
                        <span ref={directionRef} className="text-body text-text-muted" aria-hidden="true" />
                    </div>

                    <span className={`text-data font-medium ${isUp ? "text-bull" : "text-bear"}`}>
                        {snapshotReady ? `${isUp ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
                    </span>
                </div>

                {/* Right: SIM badge */}
                <span
                    title="Simulation mode — no real money"
                    className="hidden rounded-xs border border-brand/20 bg-brand/10 px-2 py-0.5 text-label text-brand sm:inline-block"
                >
                    Sim
                </span>
            </div>

            {/* ── Tier 2: Session stats + WS diagnostics + controls ── */}
            <div className="flex h-7 max-sm:h-8 items-center justify-between gap-2 sm:gap-4 px-2 sm:px-3">
                {/* Left: session stats */}
                <div className="hidden items-center md:flex">
                    <SessionStats />
                </div>

                {/* Right: WS diagnostics + mute + status */}
                <div className="ml-auto flex items-center gap-2 sm:gap-3">
                    {/* WS telemetry — only shown when connected and active */}
                    {connectionStatus === "open" && wsStats.msgsPerSec > 0 && (
                        <span
                            className="hidden font-mono text-micro text-text-muted sm:block"
                            title="WebSocket latency and message rate"
                        >
                            <span className="text-brand/80">WS</span>{" "}
                            <span className="text-text-primary">
                                {wsStats.latencyMs > 0 ? `${wsStats.latencyMs}ms` : "—"}
                            </span>
                            {" · "}
                            <span className="text-text-primary">{wsStats.msgsPerSec}/s</span>
                        </span>
                    )}

                    <BotButton />

                    {/* Interactive Help toggle */}
                    <button
                        type="button"
                        onClick={() => useTradingStore.getState().setHelpOpen(true)}
                        aria-label="Open shortcuts help"
                        className="relative btn-tactile inline-flex h-7 w-7 items-center justify-center rounded-xs border border-border bg-bg-row text-micro font-bold text-text-muted transition-colors hover:text-text-primary after:absolute after:-inset-3"
                    >
                        ?
                    </button>
                    <button
                        type="button"
                        onClick={toggleMute}
                        aria-label={muted ? "Unmute sounds" : "Mute sounds"}
                        aria-pressed={muted}
                        className="relative btn-tactile inline-flex h-7 w-7 items-center justify-center rounded-xs border border-border bg-bg-row text-text-muted hover:text-text-primary after:absolute after:-inset-3"
                    >
                        {muted ? (
                            <svg width="10" height="10" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                                <path d="M1.5 3.5H3L5.5 1.5V9.5L3 7.5H1.5V3.5Z" fill="currentColor" />
                                <path d="M8 3.5L10 5.5M10 3.5L8 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                        ) : (
                            <svg width="10" height="10" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                                <path d="M1.5 3.5H3L5.5 1.5V9.5L3 7.5H1.5V3.5Z" fill="currentColor" />
                                <path d="M7.5 3C8.5 4 8.5 7 7.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                        )}
                    </button>

                    {/* Connection status pill */}
                    <span
                        role="status"
                        aria-live="polite"
                        aria-label={`Connection status: ${connectionStatus}`}
                        className={`inline-flex items-center gap-1.5 rounded-xs border border-border bg-bg-row px-2 py-0.5 text-micro uppercase tracking-widest ${statusTone}`}
                    >
                        <span
                            className={`status-dot inline-block h-1.5 w-1.5 rounded-full ${connectionStatus === "open"
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
