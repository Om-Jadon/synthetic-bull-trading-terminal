"use client";

import { useTradingStore } from "@/store/tradingStore";

export default function ToolRail() {
    const activeTool = useTradingStore((state) => state.activeTool);
    const setActiveTool = useTradingStore((state) => state.setActiveTool);
    const clearDrawings = useTradingStore((state) => state.clearDrawings);
    const chartFullscreen = useTradingStore((state) => state.chartFullscreen);
    const toggleChartFullscreen = useTradingStore((state) => state.toggleChartFullscreen);

    return (
        <aside
            className="terminal-panel panel-delay-1 panel hidden items-center justify-center py-2 lg:flex"
            aria-label="Tool rail"
        >
            <div className="flex flex-col items-center gap-2">
                <button
                    type="button"
                    aria-label="Draw horizontal line"
                    title="Draw horizontal line"
                    aria-pressed={activeTool === "line"}
                    onClick={() => setActiveTool(activeTool === "line" ? "none" : "line")}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-xs border text-[12px] ${activeTool === "line"
                            ? "border-bull bg-bull-surface text-bull"
                            : "border-border bg-bg-row text-text-muted hover:text-text-primary"
                        }`}
                >
                    ━
                </button>

                <button
                    type="button"
                    aria-label="Clear all drawings"
                    title="Clear all drawings"
                    onClick={clearDrawings}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xs border border-border bg-bg-row text-[12px] text-text-muted hover:text-text-primary"
                >
                    ✕
                </button>

                <button
                    type="button"
                    aria-label={chartFullscreen ? "Exit fullscreen chart" : "Toggle fullscreen chart"}
                    title={chartFullscreen ? "Exit fullscreen chart" : "Toggle fullscreen chart"}
                    aria-pressed={chartFullscreen}
                    onClick={toggleChartFullscreen}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-xs border text-[12px] ${chartFullscreen
                            ? "border-bull bg-bull-surface text-bull"
                            : "border-border bg-bg-row text-text-muted hover:text-text-primary"
                        }`}
                >
                    ⛶
                </button>
            </div>
        </aside>
    );
}
