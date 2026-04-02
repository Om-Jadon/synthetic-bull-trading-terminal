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
import { readChartPalette } from "@/lib/chartTheme";
import { useThemeRevision } from "@/hooks/useThemeRevision";

export default function EquityCurve() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
    const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const themeRevision = useThemeRevision();

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const colors = readChartPalette();

        const chart = createChart(container, {
            layout: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...({ attributionLogo: false } as any),
                background: { type: ColorType.Solid, color: "transparent" },
                textColor: colors.textMuted,
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
            color: colors.bull,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
        });

        lineSeriesRef.current = lineSeries;
        chartRef.current = chart;

        return () => {
            chart.remove();
            chartRef.current = null;
            lineSeriesRef.current = null;
        };
    }, []);

    useEffect(() => {
        const chart = chartRef.current;
        const lineSeries = lineSeriesRef.current;
        if (!chart || !lineSeries) return;

        const colors = readChartPalette();
        chart.applyOptions({
            layout: {
                background: { type: ColorType.Solid, color: "transparent" },
                textColor: colors.textMuted,
                fontFamily: "var(--font-jetbrains)",
            },
        });

        const history = useTradingStore.getState().equityHistory;
        if (history.length >= 2) {
            const first = history[0].value;
            const last = history[history.length - 1].value;
            lineSeries.applyOptions({ color: last >= first ? colors.bull : colors.bear });
        } else {
            lineSeries.applyOptions({ color: colors.bull });
        }
    }, [themeRevision]);

    useEffect(() => {
        const renderHistory = (history: Array<{ time: UTCTimestamp; value: number }>) => {
            const lineSeries = lineSeriesRef.current;
            if (!lineSeries) return;

            const colors = readChartPalette();

            if (history.length === 0) {
                lineSeries.setData([]);
                return;
            }

            const first = history[0].value;
            const last = history[history.length - 1].value;
            lineSeries.applyOptions({ color: last >= first ? colors.bull : colors.bear });

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
            <div className="relative h-full min-h-15">
                <div ref={containerRef} className="h-full w-full" />
                {!snapshotReady && (
                    <div className="absolute inset-0 grid place-items-center bg-bg-panel/80 font-mono text-micro uppercase tracking-widest text-text-muted">
                        Connecting
                    </div>
                )}
            </div>
        </section>
    )
}
