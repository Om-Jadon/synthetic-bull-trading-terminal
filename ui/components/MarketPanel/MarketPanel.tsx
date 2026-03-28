"use client";

import { useEffect, useRef, useState } from "react";

import OrderBookPanel from "@/components/OrderBook/OrderBookPanel";
import TradesPanel from "@/components/OrderBook/TradesPanel";
import { type BookMode } from "@/store/tradingStore";

type MarketPanelProps = {
    mode: BookMode;
    onModeChange: (mode: BookMode) => void;
};

export default function MarketPanel({ mode, onModeChange }: MarketPanelProps) {
    const [activeTab, setActiveTab] = useState<"book" | "trades">("book");
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setDropdownOpen(false);
            }
        }
        if (dropdownOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [dropdownOpen]);

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
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex h-8 w-8 items-center justify-center rounded-[2px] text-text-muted transition-colors hover:bg-bg-row hover:text-text-primary"
                aria-label="Layout Options"
                aria-haspopup="true"
                aria-expanded={dropdownOpen}
            >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="3" r="1.5" />
                    <circle cx="8" cy="8" r="1.5" />
                    <circle cx="8" cy="13" r="1.5" />
                </svg>
            </button>
            {dropdownOpen && (
                <div className="dropdown-enter absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-[2px] border border-border bg-bg-panel p-1 shadow-2xl" role="menu">
                    {(["tab", "stacked", "large"] as const).map((item) => (
                        <button
                            key={item}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                onModeChange(item);
                                setDropdownOpen(false);
                                if (item !== "tab") {
                                    setActiveTab("book");
                                }
                            }}
                            className={`flex w-full items-center rounded-xs px-3 py-2 text-label transition-colors ${mode === item
                                ? "bg-brand/10 text-brand font-medium"
                                : "text-text-muted hover:bg-bg-row hover:text-text-primary"
                                }`}
                        >
                            <span className="mr-2 flex w-4 justify-center">
                                {mode === item && "✓"}
                            </span>
                            {item}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );

    if (mode === "tab") {
        return (
            <section className="panel relative grid h-full min-h-0 grid-rows-[auto_1fr]">
                <div className="flex h-10 max-sm:h-14 items-center justify-between gap-2 border-b border-border px-2">
                    <div className="grid flex-1 grid-cols-2 gap-1 py-1" role="tablist" aria-label="Order book and trades view">
                        <button
                            id="market-tab-book"
                            type="button"
                            role="tab"
                            aria-selected={activeTab === "book"}
                            aria-controls="market-panel-book"
                            tabIndex={activeTab === "book" ? 0 : -1}
                            onClick={() => setActiveTab("book")}
                            onKeyDown={onTabKeyDown}
                            className={`h-8 max-sm:h-11 rounded-xs border px-3 text-label ${activeTab === "book"
                                ? "border-brand bg-brand/10 text-brand font-medium"
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
                            className={`h-8 max-sm:h-11 rounded-xs border px-3 text-label ${activeTab === "trades"
                                ? "border-brand bg-brand/10 text-brand font-medium"
                                : "border-transparent text-text-muted hover:border-border hover:bg-bg-row"
                                }`}
                        >
                            Trades
                        </button>
                    </div>
                    {modeButtons}
                </div>

                <div className="min-h-0">
                    <div
                        role="tabpanel"
                        id="market-panel-book"
                        aria-labelledby="market-tab-book"
                        hidden={activeTab !== "book"}
                        className={`h-full min-h-0 ${activeTab === "book" ? "tab-content-enter" : ""}`}
                    >
                        <OrderBookPanel />
                    </div>
                    <div
                        role="tabpanel"
                        id="market-panel-trades"
                        aria-labelledby="market-tab-trades"
                        hidden={activeTab !== "trades"}
                        className={`h-full min-h-0 ${activeTab === "trades" ? "tab-content-enter" : ""}`}
                    >
                        <TradesPanel />
                    </div>
                </div>
            </section>
        );
    }

    if (mode === "stacked") {
        return (
            <section className="grid h-full min-h-0 grid-rows-[40px_minmax(0,3fr)_minmax(0,2fr)] gap-2">
                <div className="flex h-10 items-center justify-end rounded-[2px] border border-border bg-bg-panel px-2">
                    {modeButtons}
                </div>
                <div className="min-h-0">
                    <OrderBookPanel />
                </div>
                <div className="min-h-0">
                    <TradesPanel />
                </div>
            </section>
        );
    }

    return (
        <section className="grid h-full min-h-0 grid-rows-[40px_minmax(0,1fr)] gap-2">
            <div className="flex h-10 items-center justify-end rounded-[2px] border border-border bg-bg-panel px-2">
                {modeButtons}
            </div>
            <div className="grid min-h-0 grid-cols-1 gap-2 lg:grid-cols-2">
                <div className="min-h-0">
                    <OrderBookPanel />
                </div>
                <div className="min-h-0">
                    <TradesPanel />
                </div>
            </div>
        </section>
    );
}
