"use client";

import { useEffect, useRef } from "react";
import {
    CandlestickSeries,
    ColorType,
    createSeriesMarkers,
    createChart,
    HistogramSeries,
    type IChartApi,
    type IPriceLine,
    type ISeriesApi,
    type ISeriesMarkersPluginApi,
    type SeriesMarker,
    type Time,
    type UTCTimestamp,
} from "lightweight-charts";

import { useTradingStore } from "@/store/tradingStore";
import type { Candle } from "@/types/ws";

// ─── Timeframe config ────────────────────────────────────────────────────────

const TIMEFRAMES: { label: string; seconds: number }[] = [
    { label: "1s", seconds: 1 },
    { label: "5s", seconds: 5 },
    { label: "15s", seconds: 15 },
    { label: "30s", seconds: 30 },
    { label: "1m", seconds: 60 },
    { label: "5m", seconds: 300 },
];

// ─── Aggregation ─────────────────────────────────────────────────────────────

function aggregateCandles(candles: Candle[], seconds: number): Candle[] {
    if (seconds <= 1) return candles;
    const buckets = new Map<number, Candle>();
    for (const c of candles) {
        const bucket = Math.floor(c.time / seconds) * seconds;
        const existing = buckets.get(bucket);
        if (!existing) {
            buckets.set(bucket, { ...c, time: bucket });
        } else {
            buckets.set(bucket, {
                time: bucket,
                open: existing.open,
                high: Math.max(existing.high, c.high),
                low: Math.min(existing.low, c.low),
                close: c.close,
                volume: existing.volume + c.volume,
            });
        }
    }
    return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readColorVar(name: string, fallback: string): string {
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CandlestickChart() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const markerApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());

    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const chartTimeframe = useTradingStore((state) => state.chartTimeframe);
    const setChartTimeframe = useTradingStore((state) => state.setChartTimeframe);

    // Create chart once on mount
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const chart = createChart(container, {
            layout: {
                background: { type: ColorType.Solid, color: readColorVar("--color-chart-bg", "#131722") },
                textColor: readColorVar("--color-text-muted", "#8791a3"),
                fontFamily: "var(--font-jetbrains)",
                panes: {
                    separatorColor: readColorVar("--color-chart-grid", "#1e222d"),
                    separatorHoverColor: readColorVar("--color-chart-crosshair", "#2a2d3e"),
                    enableResize: false,
                },
            },
            rightPriceScale: {
                borderColor: readColorVar("--color-chart-grid", "#1e222d"),
            },
            grid: {
                vertLines: { color: readColorVar("--color-chart-grid", "#1e222d") },
                horzLines: { color: readColorVar("--color-chart-grid", "#1e222d") },
            },
            timeScale: {
                borderColor: readColorVar("--color-chart-grid", "#1e222d"),
                timeVisible: true,
                secondsVisible: true,
                barSpacing: 7,
                minBarSpacing: 0.6,
                rightOffset: 4,
            },
            crosshair: {
                vertLine: { color: readColorVar("--color-chart-crosshair", "#2a2d3e") },
                horzLine: { color: readColorVar("--color-chart-crosshair", "#2a2d3e") },
            },
            autoSize: true,
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: readColorVar("--color-bull", "#26a69a"),
            downColor: readColorVar("--color-bear", "#ef5350"),
            borderVisible: false,
            borderUpColor: readColorVar("--color-bull", "#26a69a"),
            borderDownColor: readColorVar("--color-bear", "#ef5350"),
            wickUpColor: readColorVar("--color-bull", "#26a69a"),
            wickDownColor: readColorVar("--color-bear", "#ef5350"),
        }, 0);

        const volumeSeries = chart.addSeries(HistogramSeries, {
            priceScaleId: "right",
            priceFormat: { type: "volume" },
            base: 0,
            color: `${readColorVar("--color-bull", "#26a69a")}66`,
        }, 1);

        const panes = chart.panes();
        if (panes.length > 1) {
            panes[0].setStretchFactor(3);
            panes[1].setStretchFactor(1);
        }

        volumeSeries.priceScale().applyOptions({
            borderColor: readColorVar("--color-chart-grid", "#1e222d"),
            scaleMargins: { top: 0.14, bottom: 0 },
        });

        candleSeriesRef.current = candleSeries;
        volumeSeriesRef.current = volumeSeries;
        chartRef.current = chart;
        markerApiRef.current = createSeriesMarkers(candleSeries, []);

        const clickHandler = (param: { point?: { x: number; y: number } }) => {
            const store = useTradingStore.getState();
            if (store.activeTool !== "line") return;
            if (!param.point) return;
            const price = candleSeries.coordinateToPrice(param.point.y);
            if (price == null || !Number.isFinite(price)) return;

            store.addDrawing({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                price,
            });
            store.setActiveTool("none");
        };
        chart.subscribeClick(clickHandler);

        return () => {
            chart.unsubscribeClick(clickHandler);
            chart.remove();
            chartRef.current = null;
            candleSeriesRef.current = null;
            volumeSeriesRef.current = null;
            markerApiRef.current = null;
            priceLinesRef.current.clear();
        };
    }, []);

    // Subscribe to candle + timeframe changes and update chart
    useEffect(() => {
        const bull = readColorVar("--color-bull", "#26a69a");
        const bear = readColorVar("--color-bear", "#ef5350");

        const unsubscribe = useTradingStore.subscribe((state, prevState) => {
            const candleSeries = candleSeriesRef.current;
            const volumeSeries = volumeSeriesRef.current;
            if (!candleSeries || !volumeSeries) return;

            const candles = state.candles;
            const prevCandles = prevState.candles;
            const timeframe = state.chartTimeframe;
            const prevTimeframe = prevState.chartTimeframe;

            if (candles.length === 0) return;

            const aggregated = aggregateCandles(candles, timeframe);
            if (aggregated.length === 0) return;

            const last = aggregated[aggregated.length - 1];
            const lastColor = last.close >= last.open ? bull : bear;

            // Full redraw: on first load, reconnect reset, or timeframe change
            const needsFullRedraw =
                prevCandles.length === 0 ||
                candles.length < prevCandles.length ||
                timeframe !== prevTimeframe;

            if (needsFullRedraw) {
                candleSeries.setData(
                    aggregated.map((c) => ({
                        time: c.time as UTCTimestamp,
                        open: c.open,
                        high: c.high,
                        low: c.low,
                        close: c.close,
                    })),
                );
                volumeSeries.setData(
                    aggregated.map((c) => ({
                        time: c.time as UTCTimestamp,
                        value: c.volume,
                        color: c.close >= c.open ? bull + "88" : bear + "88",
                    })),
                );
                return;
            }

            // Incremental update: patch only the last aggregated candle
            candleSeries.update({
                time: last.time as UTCTimestamp,
                open: last.open,
                high: last.high,
                low: last.low,
                close: last.close,
            });
            volumeSeries.update({
                time: last.time as UTCTimestamp,
                value: last.volume,
                color: lastColor + "88",
            });
        });

        return () => { unsubscribe(); };
    }, []);

    // Subscribe to human fill markers and redraw full marker set
    useEffect(() => {
        const bull = readColorVar("--color-bull", "#26a69a");
        const bear = readColorVar("--color-bear", "#ef5350");

        const unsubscribe = useTradingStore.subscribe((state, prevState) => {
            if (state.fills === prevState.fills) return;
            const markerApi = markerApiRef.current;
            if (!markerApi) return;

            const markers: SeriesMarker<Time>[] = state.fills.map((fill) => ({
                time: fill.time,
                position: fill.side === "buy" ? "belowBar" : "aboveBar",
                color: fill.side === "buy" ? bull : bear,
                shape: fill.side === "buy" ? "arrowUp" : "arrowDown",
                text: fill.side === "buy" ? `BUY ${fill.price.toFixed(4)}` : `SELL ${fill.price.toFixed(4)}`,
            }));

            markerApi.setMarkers(markers);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    // Subscribe to drawing state and keep chart price lines in sync
    useEffect(() => {
        const lineColor = readColorVar("--color-text-muted", "#8791a3");

        const unsubscribe = useTradingStore.subscribe((state, prevState) => {
            if (state.drawings === prevState.drawings) return;
            const candleSeries = candleSeriesRef.current;
            if (!candleSeries) return;

            const nextIds = new Set(state.drawings.map((d) => d.id));
            for (const [id, line] of priceLinesRef.current) {
                if (!nextIds.has(id)) {
                    candleSeries.removePriceLine(line);
                    priceLinesRef.current.delete(id);
                }
            }

            for (const drawing of state.drawings) {
                if (priceLinesRef.current.has(drawing.id)) continue;
                const line = candleSeries.createPriceLine({
                    price: drawing.price,
                    color: lineColor,
                    lineWidth: 1,
                    lineStyle: 2,
                    axisLabelVisible: false,
                    title: "",
                });
                priceLinesRef.current.set(drawing.id, line);
            }
        });

        return () => {
            unsubscribe();
        };
    }, []);

    return (
        <section className="panel grid h-full min-h-[clamp(300px,52vh,480px)] grid-rows-[auto_1fr]">
            <div className="panel-title flex items-center justify-between">
                <span>Candles</span>
                <div className="flex gap-px" role="group" aria-label="Chart timeframe">
                    {TIMEFRAMES.map((tf) => (
                        <button
                            key={tf.label}
                            type="button"
                            onClick={() => setChartTimeframe(tf.seconds)}
                            aria-pressed={tf.seconds === chartTimeframe}
                            className={`rounded-xs px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] transition-colors duration-100 ${tf.seconds === chartTimeframe
                                ? "bg-bg-row text-text-primary"
                                : "text-text-muted hover:text-text-primary"
                                }`}
                        >
                            {tf.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="relative w-full">
                <div ref={containerRef} className="h-full w-full" />
                {!snapshotReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-bg-row/80 text-[11px] uppercase tracking-[0.12em] text-text-muted">
                        Connecting
                    </div>
                )}
            </div>
        </section>
    );
}
