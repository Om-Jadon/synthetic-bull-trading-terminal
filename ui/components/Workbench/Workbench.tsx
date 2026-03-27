"use client";

import { useState } from "react";

import OpenOrders from "@/components/OrderEntry/OpenOrders";
import EquityCurve from "@/components/Portfolio/EquityCurve";
import PortfolioWidget from "@/components/Portfolio/PortfolioWidget";
import { useTradingStore } from "@/store/tradingStore";

export default function Workbench() {
    const [activeTab, setActiveTab] = useState<"orders" | "portfolio" | "performance">("orders");
    const chartFullscreen = useTradingStore((state) => state.chartFullscreen);

    return (
        <section className="panel flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-bg-panel px-2" role="tablist" aria-label="Workbench tabs">
                <div className="flex gap-1 py-1">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === "orders"}
                        onClick={() => setActiveTab("orders")}
                        className={`h-7 rounded-xs px-3 text-[10px] uppercase tracking-[0.08em] transition-colors border ${
                            activeTab === "orders" 
                            ? "border-border bg-bg-row text-text-primary" 
                            : "border-transparent text-text-muted hover:border-border hover:bg-bg-row hover:text-text-primary"
                        }`}
                    >
                        Orders
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === "portfolio"}
                        onClick={() => setActiveTab("portfolio")}
                        className={`h-7 rounded-xs px-3 text-[10px] uppercase tracking-[0.08em] transition-colors border ${
                            activeTab === "portfolio" 
                            ? "border-border bg-bg-row text-text-primary" 
                            : "border-transparent text-text-muted hover:border-border hover:bg-bg-row hover:text-text-primary"
                        }`}
                    >
                        Portfolio
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === "performance"}
                        onClick={() => setActiveTab("performance")}
                        className={`h-7 rounded-xs px-3 text-[10px] uppercase tracking-[0.08em] transition-colors border ${
                            activeTab === "performance" 
                            ? "border-border bg-bg-row text-text-primary" 
                            : "border-transparent text-text-muted hover:border-border hover:bg-bg-row hover:text-text-primary"
                        }`}
                    >
                        Performance
                    </button>
                </div>
            </div>
            <div className="min-h-0 flex-[1_1_0%] overflow-hidden relative bg-bg-panel flex flex-col">
                {activeTab === "orders" && (
                    <div role="tabpanel" id="workbench-orders" className="h-full w-full">
                        <OpenOrders />
                    </div>
                )}
                {activeTab === "portfolio" && (
                    <div role="tabpanel" id="workbench-portfolio" className="h-full w-full p-2 overflow-y-auto">
                        <PortfolioWidget />
                    </div>
                )}
                {activeTab === "performance" && !chartFullscreen && (
                    <div role="tabpanel" id="workbench-performance" className="h-full w-full relative">
                        <EquityCurve />
                    </div>
                )}
            </div>
        </section>
    );
}
