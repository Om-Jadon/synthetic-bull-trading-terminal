"use client";

import { useEffect, useRef, useState } from "react";

import CandlestickChart from "@/components/Chart/CandlestickChart";
import CommandPalette from "@/components/CommandPalette/CommandPalette";
import AssetBar from "@/components/Header/AssetBar";
import * as sounds from "@/lib/sound";
import OrderBook, { type BookMode } from "@/components/OrderBook/OrderBook";
import OrderEntry from "@/components/OrderEntry/OrderEntry";
import EquityCurve from "@/components/Portfolio/EquityCurve";
import PortfolioWidget from "@/components/Portfolio/PortfolioWidget";
import ToolRail from "@/components/ToolRail/ToolRail";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTradingStore } from "@/store/tradingStore";

export default function TradingTerminal() {
    const [mode, setMode] = useState<BookMode>("tab");
    const [paletteOpen, setPaletteOpen] = useState(false);
    const priceRef = useRef<HTMLSpanElement | null>(null);
    const priceFlashRef = useRef<HTMLDivElement | null>(null);
    const directionRef = useRef<HTMLSpanElement | null>(null);

    useWebSocket({ priceRef, priceFlashRef, directionRef });

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

    // Global Cmd+K / Ctrl+K to open the command palette
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setPaletteOpen((prev) => !prev);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    const portfolio = useTradingStore((state) => state.portfolio);
    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const chartFullscreen = useTradingStore((state) => state.chartFullscreen);
    const pnl = portfolio ? portfolio.unrealized_pnl + portfolio.realized_pnl : null;

    // "MARKET OPEN" flash — shows once per connect, fades after 1.8s
    const [marketFlash, setMarketFlash] = useState<"hidden" | "visible" | "fading">("hidden");
    useEffect(() => {
        if (!snapshotReady) return;
        setMarketFlash("visible");
        const t1 = setTimeout(() => setMarketFlash("fading"), 1800);
        const t2 = setTimeout(() => setMarketFlash("hidden"), 2400);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [snapshotReady]);

    const positionLabel = (h: number) => (h > 0 ? "LONG" : h < 0 ? "SHORT" : "FLAT");

    const bookWidth =
        mode === "large"
            ? "lg:w-[clamp(400px,38vw,520px)]"
            : mode === "stacked"
                ? "lg:w-[clamp(300px,30vw,400px)]"
                : "lg:w-[clamp(260px,26vw,340px)]";

    return (
        <div
            className={`terminal-shell flex h-dvh min-h-screen flex-col overflow-hidden bg-bg-primary text-text-primary ${snapshotReady ? "is-live" : ""}`}
        >
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

            {/* Boot sequence — "MARKET OPEN" flash on first connect */}
            {marketFlash !== "hidden" && (
                <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
                    <div
                        aria-live="polite"
                        className={`notice-enter border border-border bg-bg-panel px-5 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-opacity duration-500 ${marketFlash === "fading" ? "opacity-0" : "opacity-100"
                            }`}
                    >
                        <span className="text-text-muted">Market Open · </span>
                        <span className="text-brand">SYNTHETIC-BULL</span>
                        <span className="text-text-muted"> · Live</span>
                    </div>
                </div>
            )}

            <AssetBar priceRef={priceRef} priceFlashRef={priceFlashRef} directionRef={directionRef} />

            <main
                className={`relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-x-hidden overflow-y-auto p-2 sm:p-3 lg:gap-2.5 lg:overflow-hidden lg:p-3 ${chartFullscreen
                    ? "lg:grid-cols-[40px_minmax(0,1fr)]"
                    : "lg:grid-cols-[40px_minmax(0,1fr)_auto_280px]"
                    }`}
                role="main"
            >
                <ToolRail />

                {/* Chart + status strip */}
                <section className={`terminal-panel panel-delay-2 grid min-h-96 grid-rows-[1fr_auto] gap-2 ${chartFullscreen ? "lg:col-span-1" : ""}`}>
                    <CandlestickChart />
                    {/* Bottom status strip — compact session snapshot */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-border bg-bg-panel px-3 py-1.5 font-mono text-[11px]">
                        <span className="text-text-muted">
                            Cash{" "}
                            <span className="text-text-primary">
                                {portfolio ? portfolio.cash.toFixed(2) : "—"}
                            </span>
                        </span>
                        <span className="text-text-muted">
                            {portfolio ? positionLabel(portfolio.holdings) : "POS"}{" "}
                            <span className="text-text-primary">
                                {portfolio ? portfolio.holdings.toFixed(4) : "—"}
                            </span>
                        </span>
                        <span className="text-text-muted">
                            P&L{" "}
                            <span className={pnl === null ? "text-text-primary" : pnl >= 0 ? "text-bull" : "text-bear"}>
                                {pnl === null ? "—" : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`}
                            </span>
                        </span>
                    </div>
                </section>

                {/* Order book + trade tape */}
                <section className={`terminal-panel panel-delay-3 ${bookWidth} min-h-96 ${chartFullscreen ? "hidden" : ""}`}>
                    <OrderBook mode={mode} onModeChange={setMode} />
                </section>

                {/* Order entry + portfolio */}
                <section className={`terminal-panel panel-delay-4 grid min-h-96 grid-rows-[minmax(0,1fr)_clamp(170px,22vh,250px)_100px] gap-2 ${chartFullscreen ? "hidden" : ""}`}>
                    <OrderEntry />
                    <PortfolioWidget />
                    <EquityCurve />
                </section>
            </main>
        </div>
    );
}
