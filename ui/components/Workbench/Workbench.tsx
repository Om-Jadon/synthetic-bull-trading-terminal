"use client";

import { useCallback, useState } from "react";

import OpenOrders from "@/components/OrderEntry/OpenOrders";
import EquityCurve from "@/components/Portfolio/EquityCurve";
import PortfolioWidget from "@/components/Portfolio/PortfolioWidget";

type WorkbenchTab = "orders" | "portfolio" | "performance";
const TABS: WorkbenchTab[] = ["orders", "portfolio", "performance"];
const TAB_IDS: Record<WorkbenchTab, string> = {
    orders: "wb-tab-orders",
    portfolio: "wb-tab-portfolio",
    performance: "wb-tab-performance",
};
const PANEL_IDS: Record<WorkbenchTab, string> = {
    orders: "workbench-orders",
    portfolio: "workbench-portfolio",
    performance: "workbench-performance",
};
const LABELS: Record<WorkbenchTab, string> = {
    orders: "Orders",
    portfolio: "Portfolio",
    performance: "Performance",
};

export default function Workbench() {
    const [activeTab, setActiveTab] = useState<WorkbenchTab>(() => {
        try { return (localStorage.getItem("nb_workbenchTab") as WorkbenchTab) ?? "orders"; }
        catch { return "orders"; }
    });

    const handleTabChange = (tab: WorkbenchTab) => {
        try { localStorage.setItem("nb_workbenchTab", tab); } catch {}
        setActiveTab(tab);
    };

    // Roving tabIndex keyboard navigation (matches MarketPanel pattern)
    const onTabKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>, current: WorkbenchTab) => {
        const idx = TABS.indexOf(current);
        let next: WorkbenchTab | null = null;

        if (event.key === "ArrowRight") {
            next = TABS[(idx + 1) % TABS.length];
        } else if (event.key === "ArrowLeft") {
            next = TABS[(idx - 1 + TABS.length) % TABS.length];
        } else if (event.key === "Home") {
            next = TABS[0];
        } else if (event.key === "End") {
            next = TABS[TABS.length - 1];
        }

        if (next) {
            event.preventDefault();
            handleTabChange(next);
            window.requestAnimationFrame(() => {
                (document.getElementById(TAB_IDS[next!]) as HTMLButtonElement | null)?.focus();
            });
        }
    }, []);

    return (
        <section className="panel flex h-full min-h-0 flex-col">
            <div
                className="flex shrink-0 items-center border-b border-border bg-bg-panel px-2"
                role="tablist"
                aria-label="Workbench tabs"
            >
                <div className="flex gap-1 py-1">
                    {TABS.map((tab) => (
                        <button
                            key={tab}
                            id={TAB_IDS[tab]}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab}
                            aria-controls={PANEL_IDS[tab]}
                            tabIndex={activeTab === tab ? 0 : -1}
                            onClick={() => handleTabChange(tab)}
                            onKeyDown={(e) => onTabKeyDown(e, tab)}
                            className={`h-7 max-sm:h-11 rounded-xs px-3 text-label transition-colors border btn-tactile ${
                                activeTab === tab
                                    ? "border-brand bg-brand/10 text-brand font-medium"
                                    : "border-transparent text-text-muted hover:border-border hover:bg-bg-row hover:text-text-primary"
                            }`}
                        >
                            {LABELS[tab]}
                        </button>
                    ))}
                </div>
            </div>
            <div className="relative flex min-h-0 flex-[1_1_0%] flex-col overflow-hidden bg-bg-panel">
                {activeTab === "orders" && (
                    <div role="tabpanel" id={PANEL_IDS.orders} aria-labelledby={TAB_IDS.orders} className="h-full w-full tab-content-enter">
                        <OpenOrders />
                    </div>
                )}
                {activeTab === "portfolio" && (
                    <div role="tabpanel" id={PANEL_IDS.portfolio} aria-labelledby={TAB_IDS.portfolio} className="h-full w-full overflow-y-auto p-2 tab-content-enter">
                        <PortfolioWidget />
                    </div>
                )}
                {activeTab === "performance" && (
                    <div role="tabpanel" id={PANEL_IDS.performance} aria-labelledby={TAB_IDS.performance} className="relative h-full w-full tab-content-enter">
                        <EquityCurve />
                    </div>
                )}
            </div>
        </section>
    );
}
