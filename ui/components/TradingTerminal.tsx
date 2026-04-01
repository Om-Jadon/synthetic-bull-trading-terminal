"use client";

import { useEffect, useRef, useState } from "react";

import CandlestickChart from "@/components/Chart/CandlestickChart";
import CommandPalette from "@/components/CommandPalette/CommandPalette";
import AssetBar from "@/components/Header/AssetBar";
import HelpModal from "@/components/Help/HelpModal";
import MarketPanel from "@/components/MarketPanel/MarketPanel";
import * as sounds from "@/lib/sound";
import OrderEntry from "@/components/OrderEntry/OrderEntry";
import Workbench from "@/components/Workbench/Workbench";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTradingStore } from "@/store/tradingStore";
import SessionStats from "./Header/SessionStats";
import ToastManager from "./Toast/ToastManager";

export default function TradingTerminal() {
    const mode = useTradingStore((state) => state.bookMode);
    const setMode = useTradingStore((state) => state.setBookMode);
    const setHelpOpen = useTradingStore((state) => state.setHelpOpen);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [paletteSession, setPaletteSession] = useState(0);
    const priceRef = useRef<HTMLSpanElement | null>(null);
    const priceFlashRef = useRef<HTMLDivElement | null>(null);
    const directionRef = useRef<HTMLSpanElement | null>(null);
    const fullscreenHostRef = useRef<HTMLDivElement | null>(null);

    useWebSocket({ priceRef, priceFlashRef, directionRef });

    const openPalette = () => {
        setPaletteSession((s) => s + 1);
        setPaletteOpen(true);
    };

    // Hydrate localStorage preferences after mount to avoid SSR/client hydration mismatch
    useEffect(() => {
        useTradingStore.getState().hydrateFromStorage();
    }, []);

    // Bootstrap AudioContext on first user gesture (browser autoplay policy)
    useEffect(() => {
        const init = () => {
            sounds.initAudio();
            sounds.setMuted(sounds.loadMutePreference());
            window.removeEventListener("pointerdown", init);
            window.removeEventListener("keydown", init);
        };
        window.addEventListener("pointerdown", init, { once: true });
        window.addEventListener("keydown", init, { once: true });
        return () => {
            window.removeEventListener("pointerdown", init);
            window.removeEventListener("keydown", init);
        };
    }, []);

    // Global Help Shortcut
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
                // Only trigger if not in an input
                if (
                    document.activeElement instanceof HTMLInputElement ||
                    document.activeElement instanceof HTMLTextAreaElement
                )
                    return;

                e.preventDefault();
                setHelpOpen(true);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [setHelpOpen]);

    // Global Cmd+K / Ctrl+K to open the command palette
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setPaletteOpen((prev) => {
                    if (prev) return false;
                    setPaletteSession((s) => s + 1);
                    return true;
                });
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    const portfolio = useTradingStore((state) => state.portfolio);
    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const chartFullscreen = useTradingStore((state) => state.chartFullscreen);
    const pnl = portfolio ? portfolio.unrealized_pnl + portfolio.realized_pnl : null;



    useEffect(() => {
        const handler = () => {
            const isNativeFullscreen = document.fullscreenElement === fullscreenHostRef.current;
            const store = useTradingStore.getState();
            if (isNativeFullscreen !== store.chartFullscreen) {
                store.toggleChartFullscreen();
            }
        };
        document.addEventListener("fullscreenchange", handler);
        return () => document.removeEventListener("fullscreenchange", handler);
    }, []);

    const handleFullscreenToggle = () => {
        const host = fullscreenHostRef.current;
        if (!host) return;

        if (document.fullscreenElement === host) {
            document.exitFullscreen?.().catch(() => { });
        } else {
            host.requestFullscreen?.().catch(() => { });
        }
    };

    const positionLabel = (h: number) => (h > 0 ? "Long" : h < 0 ? "Short" : "Position");

    const bookColumnPct =
        mode === "large" ? "30%" : mode === "stacked" ? "26%" : "22%";
    const orderColumnPct = "20%";

    return (
        <div
            className={`terminal-shell flex h-dvh min-h-screen flex-col overflow-hidden bg-bg-primary text-text-primary ${snapshotReady ? "is-live" : ""}`}
        >
            <CommandPalette key={paletteSession} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
            <HelpModal />
            <ToastManager />

            {/* Boot sequence — "MARKET OPEN" flash on first connect */}
            {snapshotReady && (
                <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
                    <div
                        aria-live="polite"
                        className="notice-enter border border-border bg-bg-panel px-5 py-2 font-mono text-[11px] uppercase tracking-[0.18em] market-flash-scanning"
                    >
                        <span className="text-text-muted">Market Open · </span>
                        <span className="text-brand">SYNTHETIC-BULL</span>
                        <span className="text-text-muted"> · Live</span>
                    </div>
                </div>
            )}

            <AssetBar priceRef={priceRef} priceFlashRef={priceFlashRef} directionRef={directionRef} />

            <div ref={fullscreenHostRef} className="min-h-0 flex-1 min-w-0 w-full flex flex-col overflow-y-auto lg:overflow-hidden">
                {chartFullscreen ? (
                    <div className="relative h-full">
                        <SessionStats variant="fullscreen" />
                        <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-xs border border-border bg-bg-panel/85 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
                            Esc to Exit Fullscreen
                        </div>
                        <p className="sr-only" aria-live="polite">
                            Fullscreen chart enabled. View all session statistics in the header.
                        </p>
                        <CandlestickChart
                            onPaletteOpen={openPalette}
                            onFullscreenToggle={handleFullscreenToggle}
                        />
                    </div>
                ) : (
                    <main
                        className="relative z-10 flex min-h-0 flex-1 flex-col gap-2 p-1.5 sm:p-3 md:grid md:grid-cols-[1fr_30%] md:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] md:gap-2 lg:h-full lg:overflow-hidden lg:flex lg:flex-row lg:gap-2.5 lg:p-3"
                        role="main"
                    >
                        {/* Chart + status strip */}
                        <section className="terminal-panel panel-delay-2 grid min-h-[clamp(200px,42vh,400px)] min-w-0 grid-rows-[1fr_auto] md:col-start-1 md:row-start-1 md:col-span-1 md:row-span-1 lg:min-h-0 lg:flex-1 lg:min-w-0 lg:h-full">
                            <CandlestickChart
                                onPaletteOpen={openPalette}
                                onFullscreenToggle={handleFullscreenToggle}
                            />
                            {/* Bottom status strip — compact session snapshot */}
                            <div className="max-md:hidden flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-bg-panel px-3 py-1.5 font-mono text-[12px]">
                                <span className="text-text-muted">
                                    Cash{" "}
                                    <span className="font-medium text-text-primary">
                                        {portfolio ? portfolio.cash.toFixed(2) : "—"}
                                    </span>
                                </span>
                                <span className="text-text-muted">
                                    {portfolio ? positionLabel(portfolio.holdings) : "POS"}{" "}
                                    <span className="font-medium text-text-primary">
                                        {portfolio ? portfolio.holdings.toFixed(4) : "—"}
                                    </span>
                                </span>
                                <span className="text-text-muted">
                                    P&L{" "}
                                    <span className={`font-medium ${pnl === null ? "text-text-primary" : pnl >= 0 ? "text-bull" : "text-bear"}`}>
                                        {pnl === null ? "—" : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`}
                                    </span>
                                </span>
                            </div>

                        </section>

                        {/* Order book + trade tape */}
                        <section
                            className="terminal-panel panel-delay-3 min-h-[clamp(240px,48vh,480px)] min-w-0 max-lg:w-auto! max-lg:basis-auto! md:col-start-2 md:row-start-1 md:col-span-1 md:row-span-2 lg:shrink-0 lg:min-h-0 lg:h-full"
                            style={{ flexBasis: bookColumnPct, width: bookColumnPct } as React.CSSProperties}
                        >
                            <MarketPanel mode={mode} onModeChange={setMode} />
                        </section>

                        {/* Order entry + workbench */}
                        <section
                            className="terminal-panel panel-delay-4 grid min-h-[clamp(220px,38vh,420px)] min-w-0 max-lg:w-auto! max-lg:basis-auto! grid-rows-[auto_minmax(0,1fr)] md:col-start-1 md:row-start-2 md:col-span-1 md:row-span-1 lg:shrink-0 lg:h-full"
                            style={{ flexBasis: orderColumnPct, width: orderColumnPct } as React.CSSProperties}
                        >
                            <OrderEntry />
                            <div className="border-t border-border min-h-0">
                                <Workbench />
                            </div>
                        </section>
                    </main>
                )}
            </div>
        </div>
    );
}
