"use client";

import { useMemo, useState } from "react";

import { useTradingStore } from "@/store/tradingStore";

import OrderRow from "./OrderRow";
import SpreadRow from "./SpreadRow";
import TradesTable from "./TradesTable";
import TradeTape from "./TradeTape";

export type BookMode = "tab" | "stacked" | "large";

type OrderBookProps = {
    mode: BookMode;
    onModeChange: (mode: BookMode) => void;
};

function cumulativeRows(levels: [number, number][]) {
    let running = 0;
    return levels.map(([price, size]) => {
        running += size;
        return { price, size, total: running };
    });
}

export default function OrderBook({ mode, onModeChange }: OrderBookProps) {
    const bids = useTradingStore((state) => state.bids);
    const asks = useTradingStore((state) => state.asks);
    const trades = useTradingStore((state) => state.trades);
    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const [activeTab, setActiveTab] = useState<"book" | "trades">("book");
    const resolvedTab = mode === "tab" ? activeTab : "book";

    const bidRows = useMemo(() => cumulativeRows(bids.slice(0, 15)), [bids]);
    const askRows = useMemo(() => cumulativeRows(asks.slice(0, 15)).reverse(), [asks]);
    const maxTotal = useMemo(() => {
        const bidMax = bidRows.length ? bidRows[bidRows.length - 1].total : 1;
        const askMax = askRows.length ? askRows[0].total : 1;
        return Math.max(1, bidMax, askMax);
    }, [askRows, bidRows]);

    const bestBid = bids[0]?.[0];
    const bestAsk = asks[0]?.[0];

    const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            const nextTab = activeTab === "book" ? "trades" : "book";
            setActiveTab(nextTab);
            const nextId = nextTab === "book" ? "market-tab-book" : "market-tab-trades";
            window.requestAnimationFrame(() => {
                (document.getElementById(nextId) as HTMLButtonElement | null)?.focus();
            });
            return;
        }

        if (event.key === "Home") {
            event.preventDefault();
            setActiveTab("book");
            window.requestAnimationFrame(() => {
                (document.getElementById("market-tab-book") as HTMLButtonElement | null)?.focus();
            });
            return;
        }

        if (event.key === "End") {
            event.preventDefault();
            setActiveTab("trades");
            window.requestAnimationFrame(() => {
                (document.getElementById("market-tab-trades") as HTMLButtonElement | null)?.focus();
            });
        }
    };

    const modeButtons = (
        <div className="flex gap-1" role="group" aria-label="Order book layout mode">
            {(["tab", "stacked", "large"] as const).map((item) => (
                <button
                    key={item}
                    type="button"
                    onClick={() => onModeChange(item)}
                    aria-pressed={mode === item}
                    className={`h-7 rounded-[3px] border px-2 text-[10px] uppercase tracking-[0.08em] ${mode === item
                        ? "border-border bg-bg-row text-text-primary"
                        : "border-transparent text-text-muted hover:border-border hover:bg-bg-row"
                        }`}
                >
                    {item}
                </button>
            ))}
        </div>
    );

    const tradesList = <TradesTable trades={trades} />;

    const bookRows = (
        <div className="grid h-full min-h-0 grid-rows-[auto_1fr]">
            <div className="grid h-6 grid-cols-3 items-center border-b border-border/70 px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
                <span>Price</span>
                <span className="text-right">Size</span>
                <span className="text-right">Total</span>
            </div>
            <div className="panel-scroller top-fade min-h-0 overflow-y-auto overflow-x-hidden pt-1">
                {askRows.map((row) => (
                    <OrderRow
                        key={`ask-${row.price}`}
                        side="ask"
                        price={row.price}
                        size={row.size}
                        totalSize={row.total}
                        depthPct={row.total / maxTotal}
                    />
                ))}
                <SpreadRow bestBid={bestBid} bestAsk={bestAsk} />
                {bidRows.map((row) => (
                    <OrderRow
                        key={`bid-${row.price}`}
                        side="bid"
                        price={row.price}
                        size={row.size}
                        totalSize={row.total}
                        depthPct={row.total / maxTotal}
                    />
                ))}
            </div>
        </div>
    );

    const bookPane = (
        <section className="panel relative h-full min-h-0">
            <div className="flex h-8 items-center justify-between border-b border-border px-2">
                <div className="panel-title border-0 p-0">Order Book</div>
                {modeButtons}
            </div>

            <div className="h-[calc(100%-32px)]">{bookRows}</div>

            {!snapshotReady && (
                <div role="status" aria-live="polite" className="absolute inset-0 flex items-center justify-center bg-bg-panel/80 text-[10px] uppercase tracking-[0.12em] text-text-muted">
                    Connecting
                </div>
            )}
        </section>
    );

    if (mode === "tab") {
        return (
            <section className="panel relative grid h-full min-h-0 grid-rows-[36px_40px_1fr]">
                <div className="flex h-9 items-center justify-between border-b border-border px-2">
                    <div className="panel-title border-0 p-0">Market View</div>
                    {modeButtons}
                </div>
                <div className="grid grid-cols-2 gap-1 border-b border-border p-1" role="tablist" aria-label="Market view">
                    <button
                        id="market-tab-book"
                        type="button"
                        role="tab"
                        aria-selected={activeTab === "book"}
                        aria-controls="market-panel-book"
                        tabIndex={activeTab === "book" ? 0 : -1}
                        onClick={() => setActiveTab("book")}
                        onKeyDown={onTabKeyDown}
                        className={`h-8 rounded-[3px] border text-[10px] uppercase tracking-[0.1em] ${activeTab === "book"
                            ? "border-border bg-bg-row text-text-primary"
                            : "border-transparent text-text-muted hover:border-border hover:bg-bg-row"
                            }`}
                    >
                        Order Book
                    </button>
                    <button
                        id="market-tab-trades"
                        type="button"
                        role="tab"
                        aria-selected={activeTab === "trades"}
                        aria-controls="market-panel-trades"
                        tabIndex={activeTab === "trades" ? 0 : -1}
                        onClick={() => setActiveTab("trades")}
                        onKeyDown={onTabKeyDown}
                        className={`h-8 rounded-[3px] border text-[10px] uppercase tracking-[0.1em] ${activeTab === "trades"
                            ? "border-border bg-bg-row text-text-primary"
                            : "border-transparent text-text-muted hover:border-border hover:bg-bg-row"
                            }`}
                    >
                        Trades
                    </button>
                </div>
                <div className="min-h-0">
                    <div
                        role="tabpanel"
                        id="market-panel-book"
                        aria-labelledby="market-tab-book"
                        hidden={resolvedTab !== "book"}
                        className="h-full min-h-0"
                    >
                        {bookRows}
                    </div>
                    <div
                        role="tabpanel"
                        id="market-panel-trades"
                        aria-labelledby="market-tab-trades"
                        hidden={resolvedTab !== "trades"}
                        className="h-full min-h-0"
                    >
                        {tradesList}
                    </div>
                </div>
            </section>
        );
    }

    if (mode === "stacked") {
        return (
            <div className="grid h-full min-h-0 grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-2">
                {bookPane}
                <div className="min-h-0">
                    <TradeTape />
                </div>
            </div>
        );
    }

    return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {bookPane}
            <div className="min-h-0">
                <TradeTape />
            </div>
        </div>
    );
}
