"use client";

import { useRef, useState } from "react";

import CandlestickChart from "@/components/Chart/CandlestickChart";
import AssetBar from "@/components/Header/AssetBar";
import OrderBook, { type BookMode } from "@/components/OrderBook/OrderBook";
import OrderEntry from "@/components/OrderEntry/OrderEntry";
import PortfolioWidget from "@/components/Portfolio/PortfolioWidget";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTradingStore } from "@/store/tradingStore";

export default function TradingTerminal() {
    const [mode, setMode] = useState<BookMode>("tab");
    const priceRef = useRef<HTMLSpanElement | null>(null);
    const priceFlashRef = useRef<HTMLDivElement | null>(null);
    const directionRef = useRef<HTMLSpanElement | null>(null);

    useWebSocket({ priceRef, priceFlashRef, directionRef });

    const portfolio = useTradingStore((state) => state.portfolio);
    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const pnl = portfolio ? portfolio.unrealized_pnl + portfolio.realized_pnl : null;

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
            <AssetBar priceRef={priceRef} priceFlashRef={priceFlashRef} directionRef={directionRef} />

            <main
                className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-x-hidden overflow-y-auto p-2 sm:p-3 lg:grid-cols-[40px_minmax(0,1fr)_auto_280px] lg:gap-2.5 lg:overflow-hidden lg:p-3"
                role="main"
            >
                {/* Sidebar — 40px tool rail */}
                <aside
                    className="terminal-panel panel-delay-1 panel hidden items-center justify-center text-[9px] uppercase tracking-[0.24em] text-text-muted lg:flex"
                    aria-label="Tool rail"
                >
                    <span className="[writing-mode:vertical-rl]">TOOLS</span>
                </aside>

                {/* Chart + status strip */}
                <section className="terminal-panel panel-delay-2 grid min-h-96 grid-rows-[1fr_auto] gap-2">
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
                <section className={`terminal-panel panel-delay-3 ${bookWidth} min-h-96`}>
                    <OrderBook mode={mode} onModeChange={setMode} />
                </section>

                {/* Order entry + portfolio */}
                <section className="terminal-panel panel-delay-4 grid min-h-96 grid-rows-[minmax(0,1fr)_clamp(200px,26vh,280px)] gap-2">
                    <OrderEntry />
                    <PortfolioWidget />
                </section>
            </main>
        </div>
    );
}
