"use client";

import { useEffect, useRef } from "react";
import {
    ColorType,
    createChart,
    LineSeries,
    type ISeriesApi,
    type UTCTimestamp,
} from "lightweight-charts";

import { useTradingStore } from "@/store/tradingStore";

const C = {
    textMuted: "#746d6a",  // oklch(54% 0.01 50)
    bull: "#11b34a",       // oklch(67% 0.19 148)
    bear: "#df202e",       // oklch(58% 0.22 25)
} as const;

export default function EquityCurve() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const snapshotReady = useTradingStore((state) => state.snapshotReady);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const chart = createChart(container, {
            layout: {
                background: { type: ColorType.Solid, color: "transparent" },
                textColor: C.textMuted,
                fontFamily: "var(--font-jetbrains)",
            },
            rightPriceScale: {
                visible: false,
            },
            leftPriceScale: {
                visible: false,
            },
            grid: {
                vertLines: { visible: false, color: "transparent" },
                horzLines: { visible: false, color: "transparent" },
            },
            crosshair: {
                vertLine: { visible: false, color: "transparent" },
                horzLine: { visible: false, color: "transparent" },
            },
            timeScale: {
                visible: false,
                borderVisible: false,
            },
            handleScroll: false,
            handleScale: false,
            autoSize: true,
        });

        const lineSeries = chart.addSeries(LineSeries, {
            color: C.bull,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
        });

        lineSeriesRef.current = lineSeries;

        return () => {
            chart.remove();
            lineSeriesRef.current = null;
        };
    }, []);

    useEffect(() => {
        const renderHistory = (history: Array<{ time: UTCTimestamp; value: number }>) => {
            const lineSeries = lineSeriesRef.current;
            if (!lineSeries) return;

            if (history.length === 0) {
                lineSeries.setData([]);
                return;
            }

            const first = history[0].value;
            const last = history[history.length - 1].value;
            lineSeries.applyOptions({ color: last >= first ? C.bull : C.bear });

            lineSeries.setData(
                history.map((point) => ({
                    time: point.time,
                    value: point.value,
                })),
            );
        };

        renderHistory(useTradingStore.getState().equityHistory);

        const unsubscribe = useTradingStore.subscribe((state, prevState) => {
            if (state.equityHistory === prevState.equityHistory) return;
            renderHistory(state.equityHistory);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    return (
        <section className="panel relative grid h-full grid-rows-[auto_1fr]">
            <div className="panel-title">Equity Curve</div>
            <div className="relative h-full min-h-[60px]">
                <div ref={containerRef} className="h-full w-full" />
                {!snapshotReady && (
                    <div className="absolute inset-0 grid place-items-center bg-bg-panel/80 font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
                        Waiting
                    </div>
                )}
            </div>
        </section>
    )
}
