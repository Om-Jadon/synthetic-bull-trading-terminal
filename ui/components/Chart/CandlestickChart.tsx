"use client";

import { useEffect, useRef } from "react";
import {
    CandlestickSeries,
    ColorType,
    createSeriesMarkers,
    createChart,
    HistogramSeries,
    TickMarkType,
    type IChartApi,
    type IPriceLine,
    type ISeriesApi,
    type ISeriesMarkersPluginApi,
    type SeriesMarker,
    type Time,
    type UTCTimestamp,
} from "lightweight-charts";

import { useTradingStore, type TradingStore } from "@/store/tradingStore";
import type { Candle } from "@/types/ws";
import { readChartPalette, type ChartPalette } from "@/lib/chartTheme";
import { useThemeRevision } from "@/hooks/useThemeRevision";

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

function hex8(hex: string, alpha: number): string {
    return `${hex}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

type CandlestickChartProps = {
    onPaletteOpen?: () => void;
    onFullscreenToggle?: () => void;
};

export default function CandlestickChart({ onPaletteOpen, onFullscreenToggle }: CandlestickChartProps = {}) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const markerApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    const vwapLineRef = useRef<IPriceLine | null>(null);

    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const chartTimeframe = useTradingStore((state) => state.chartTimeframe);
    const setChartTimeframe = useTradingStore((state) => state.setChartTimeframe);
    const chartFullscreen = useTradingStore((state) => state.chartFullscreen);
    const paletteRef = useRef<ChartPalette>(readChartPalette());
    const themeRevision = useThemeRevision();
    type ChartOptionsArg = Parameters<IChartApi["applyOptions"]>[0];

    const handleFullscreenToggle = () => {
        if (onFullscreenToggle) {
            onFullscreenToggle();
            return;
        }

        // Fallback keeps the control functional in isolated renders/tests.
        if (chartFullscreen) {
            document.exitFullscreen?.().catch(() => { });
        } else {
            document.documentElement.requestFullscreen?.().catch(() => { });
        }
    };

    useEffect(() => {
        if (onFullscreenToggle) return;

        const syncFullscreenState = () => {
            const isNativeFullscreen = !!document.fullscreenElement;
            const store = useTradingStore.getState();
            if (store.chartFullscreen !== isNativeFullscreen) {
                store.toggleChartFullscreen();
            }
        };

        document.addEventListener("fullscreenchange", syncFullscreenState);
        return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
    }, [onFullscreenToggle]);

    // Create chart once on mount
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const colors = readChartPalette();
        paletteRef.current = colors;
        const chart = createChart(container, {
            layout: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...({ attributionLogo: false } as any),
                background: { type: ColorType.Solid, color: colors.bg },
                textColor: colors.textMuted,
                fontFamily: "var(--font-jetbrains)",
                panes: {
                    separatorColor: colors.grid,
                    separatorHoverColor: colors.crosshair,
                    enableResize: false,
                },
            },
            rightPriceScale: {
                borderColor: colors.grid,
            },
            grid: {
                vertLines: { color: colors.grid },
                horzLines: { color: colors.grid },
            },
            timeScale: {
                borderColor: colors.grid,
                timeVisible: true,
                secondsVisible: true,
                barSpacing: 7,
                minBarSpacing: 0.6,
                rightOffset: 4,
                tickMarkFormatter: (t: UTCTimestamp, type: TickMarkType) => {
                    const d = new Date(t * 1000);
                    if (type === TickMarkType.Year) return d.toLocaleDateString([], { year: "numeric" });
                    if (type === TickMarkType.Month) return d.toLocaleDateString([], { month: "short" });
                    if (type === TickMarkType.DayOfMonth) return d.toLocaleDateString([], { month: "short", day: "numeric" });
                    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                },
            },
            localization: {
                timeFormatter: (t: number) =>
                    new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            },
            crosshair: {
                vertLine: { color: colors.crosshair },
                horzLine: { color: colors.crosshair },
            },
            autoSize: true,
        });

        chart.applyOptions({
            watermark: {
                visible: true,
                text: "SYNTHETIC-BULL",
                color: colors.watermark,
                fontSize: 36,
                horzAlign: "center",
                vertAlign: "center",
            },
        } as ChartOptionsArg);

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: colors.bull,
            downColor: colors.bear,
            borderVisible: false,
            borderUpColor: colors.bull,
            borderDownColor: colors.bear,
            wickUpColor: colors.bull,
            wickDownColor: colors.bear,
        }, 0);

        const volumeSeries = chart.addSeries(HistogramSeries, {
            priceScaleId: "vol",
            priceFormat: { type: "volume" },
            base: 0,
            color: hex8(colors.bull, 0.33),
        }, 1);

        const panes = chart.panes();
        if (panes.length > 1) {
            panes[0].setStretchFactor(3);
            panes[1].setStretchFactor(1);
        }

        volumeSeries.priceScale().applyOptions({
            borderColor: colors.grid,
            scaleMargins: { top: 0.14, bottom: 0 },
            visible: false,
        });
        // Note: "vol" is isolated from "right" so hiding it does not affect the candlestick price axis.

        candleSeriesRef.current = candleSeries;
        volumeSeriesRef.current = volumeSeries;
        chartRef.current = chart;
        markerApiRef.current = createSeriesMarkers(candleSeries, []);

        return () => {
            chart.remove();
            chartRef.current = null;
            candleSeriesRef.current = null;
            volumeSeriesRef.current = null;
            markerApiRef.current = null;
            vwapLineRef.current = null;
        };
    }, []);

    // Live-apply theme options without recreating chart so data and zoom state are preserved.
    useEffect(() => {
        const chart = chartRef.current;
        const candleSeries = candleSeriesRef.current;
        const volumeSeries = volumeSeriesRef.current;
        if (!chart || !candleSeries || !volumeSeries) return;

        const colors = readChartPalette();
        paletteRef.current = colors;

        chart.applyOptions({
            layout: {
                background: { type: ColorType.Solid, color: colors.bg },
                textColor: colors.textMuted,
                panes: {
                    separatorColor: colors.grid,
                    separatorHoverColor: colors.crosshair,
                    enableResize: false,
                },
            },
            rightPriceScale: {
                borderColor: colors.grid,
            },
            grid: {
                vertLines: { color: colors.grid },
                horzLines: { color: colors.grid },
            },
            timeScale: {
                borderColor: colors.grid,
            },
            crosshair: {
                vertLine: { color: colors.crosshair },
                horzLine: { color: colors.crosshair },
            },
        });

        chart.applyOptions({
            watermark: {
                visible: true,
                text: "SYNTHETIC-BULL",
                color: colors.watermark,
                fontSize: 36,
                horzAlign: "center",
                vertAlign: "center",
            },
        } as ChartOptionsArg);

        candleSeries.applyOptions({
            upColor: colors.bull,
            downColor: colors.bear,
            borderUpColor: colors.bull,
            borderDownColor: colors.bear,
            wickUpColor: colors.bull,
            wickDownColor: colors.bear,
        });

        volumeSeries.priceScale().applyOptions({
            borderColor: colors.grid,
            scaleMargins: { top: 0.14, bottom: 0 },
            visible: false,
        });

        const state = useTradingStore.getState();
        const aggregated = aggregateCandles(state.candles, state.chartTimeframe);
        volumeSeries.setData(
            aggregated.map((c) => ({
                time: c.time as UTCTimestamp,
                value: c.volume,
                color: c.close >= c.open ? hex8(colors.bull, 0.33) : hex8(colors.bear, 0.33),
            })),
        );

        const vwap = state.vwap > 0 ? state.vwap : null;
        if (vwap !== null && vwapLineRef.current) {
            vwapLineRef.current.applyOptions({ price: vwap, color: colors.vwap });
        }

        const markerApi = markerApiRef.current;
        if (markerApi) {
            const markers: SeriesMarker<Time>[] = state.fills.map((fill) => ({
                time: fill.time,
                position: fill.side === "buy" ? "belowBar" : "aboveBar",
                color: fill.side === "buy" ? colors.bull : colors.bear,
                shape: fill.side === "buy" ? "arrowUp" : "arrowDown",
                text: fill.side === "buy" ? `BUY ${fill.price.toFixed(4)}` : `SELL ${fill.price.toFixed(4)}`,
            }));
            markerApi.setMarkers(markers);
        }
    }, [themeRevision]);

    // Subscribe to candle + timeframe changes and update chart
    useEffect(() => {
        const syncData = (state: TradingStore, prevState: TradingStore) => {
            const candleSeries = candleSeriesRef.current;
            const volumeSeries = volumeSeriesRef.current;
            if (!candleSeries || !volumeSeries) return;

            const { bull, bear } = paletteRef.current;

            const candles = state.candles;
            const prevCandles = prevState.candles || [];
            const timeframe = state.chartTimeframe;
            const prevTimeframe = prevState.chartTimeframe;
            if (candles === prevCandles && timeframe === prevTimeframe) return;

            if (candles.length === 0) return;

            const aggregated = aggregateCandles(candles, timeframe);
            if (aggregated.length === 0) return;

            const last = aggregated[aggregated.length - 1];
            const lastColor = last.close >= last.open ? bull : bear;

            // Full redraw: on first load, reconnect reset, timeframe change,
            // or snapshot arriving after pre-snapshot trades (candles jump by >1)
            const needsFullRedraw =
                prevCandles.length === 0 ||
                candles.length < prevCandles.length ||
                candles.length - prevCandles.length > 1 ||
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
                        color: c.close >= c.open ? hex8(bull, 0.33) : hex8(bear, 0.33),
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
                color: hex8(lastColor, 0.33),
            });
        };

        const currentState = useTradingStore.getState();
        syncData(currentState, { candles: [], chartTimeframe: currentState.chartTimeframe } as unknown as TradingStore);

        const unsubscribe = useTradingStore.subscribe(syncData);

        return () => { unsubscribe(); };
    }, []);

    // Subscribe to VWAP and maintain price line
    useEffect(() => {
        const syncVwap = (state: TradingStore, prevState: TradingStore) => {
            if (
                prevState &&
                state.vwap === prevState.vwap
            ) {
                return;
            }
            const candleSeries = candleSeriesRef.current;
            if (!candleSeries) return;

            const vwap = state.vwap > 0 ? state.vwap : null;
            if (vwap === null) return;

            if (!vwapLineRef.current) {
                vwapLineRef.current = candleSeries.createPriceLine({
                    price: vwap,
                    color: paletteRef.current.vwap,
                    lineWidth: 1,
                    lineStyle: 1,
                    axisLabelVisible: true,
                    title: "",
                });
            } else {
                vwapLineRef.current.applyOptions({ price: vwap, color: paletteRef.current.vwap });
            }
        };

        syncVwap(useTradingStore.getState(), {} as TradingStore);
        const unsubscribe = useTradingStore.subscribe(syncVwap);

        return () => { unsubscribe(); };
    }, []);

    // Subscribe to human fill markers and redraw full marker set
    useEffect(() => {
        const syncMarkers = (state: TradingStore, prevState: TradingStore) => {
            if (prevState.fills && state.fills === prevState.fills) return;
            const markerApi = markerApiRef.current;
            if (!markerApi) return;

            const { bull, bear } = paletteRef.current;

            const markers: SeriesMarker<Time>[] = state.fills.map((fill) => ({
                time: fill.time,
                position: fill.side === "buy" ? "belowBar" : "aboveBar",
                color: fill.side === "buy" ? bull : bear,
                shape: fill.side === "buy" ? "arrowUp" : "arrowDown",
                text: fill.side === "buy" ? `BUY ${fill.price.toFixed(4)}` : `SELL ${fill.price.toFixed(4)}`,
            }));

            markerApi.setMarkers(markers);
        };

        syncMarkers(useTradingStore.getState(), {} as TradingStore);
        const unsubscribe = useTradingStore.subscribe(syncMarkers);

        return () => { unsubscribe(); };
    }, []);

    return (
        <section className="panel grid h-full min-w-0 min-h-[clamp(200px,52vh,480px)] grid-rows-[auto_1fr]">
            <div className="panel-title flex items-center justify-between border-b border-border bg-bg-panel px-3 py-1.5 min-h-9 max-sm:px-2 max-sm:py-1">
                <div className="flex gap-0.5" role="group" aria-label="Chart timeframe">
                    {TIMEFRAMES.map((tf) => (
                        <button
                            key={tf.label}
                            type="button"
                            onClick={() => setChartTimeframe(tf.seconds)}
                            aria-pressed={tf.seconds === chartTimeframe}
                            className={`touch-target-compact flex h-7 max-sm:h-8 min-w-8 items-center justify-center rounded-xs px-2 py-1 font-mono text-micro uppercase tracking-[0.08em] transition-colors duration-100 ${tf.seconds === chartTimeframe
                                ? "border border-border bg-bg-row text-text-primary"
                                : "border border-transparent text-text-muted hover:text-text-primary"
                                }`}
                        >
                            {tf.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    {onPaletteOpen && (
                        <button
                            type="button"
                            aria-label="Command palette"
                            onClick={onPaletteOpen}
                            className="touch-target-compact inline-flex h-6 w-6 max-sm:h-7 max-sm:w-7 items-center justify-center rounded-xs border border-border bg-bg-row text-[12px] text-text-muted hover:text-text-primary transition-colors duration-100"
                        >
                            ⌘
                        </button>
                    )}
                    <button
                        type="button"
                        aria-label={chartFullscreen ? "Exit fullscreen chart" : "Toggle fullscreen chart"}
                        onClick={handleFullscreenToggle}
                        className="touch-target-compact inline-flex h-6 w-6 max-sm:h-7 max-sm:w-7 items-center justify-center rounded-xs border border-border bg-bg-row text-[12px] text-text-muted hover:text-text-primary transition-colors duration-100"
                    >
                        {chartFullscreen ? "✕" : "⛶"}
                    </button>
                </div>
            </div>
            <div className="relative w-full min-w-0 min-h-0">
                <div
                    ref={containerRef}
                    role="img"
                    aria-label="Interactive candlestick chart"
                    aria-busy={!snapshotReady}
                    className="h-full w-full"
                />
                {!snapshotReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-bg-row/80 text-label uppercase tracking-[0.12em] text-text-muted">
                        Connecting
                    </div>
                )}
            </div>
        </section>
    );
}
