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

type ChartPalette = {
    bg: string;
    textMuted: string;
    grid: string;
    crosshair: string;
    bull: string;
    bear: string;
    vwap: string;
};

const DEFAULT_PALETTE: ChartPalette = {
    bg: "#060403",
    textMuted: "#746d6a",
    grid: "#1a1513",
    crosshair: "#292220",
    bull: "#11b34a",
    bear: "#df202e",
    vwap: "#8791a3",
};

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

function readHexColorVar(name: string, fallback: string): string {
    if (typeof window === "undefined") return fallback;
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ? value : fallback;
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
    const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());

    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const chartTimeframe = useTradingStore((state) => state.chartTimeframe);
    const setChartTimeframe = useTradingStore((state) => state.setChartTimeframe);
    const chartFullscreen = useTradingStore((state) => state.chartFullscreen);
    const paletteRef = useRef<ChartPalette>(DEFAULT_PALETTE);

    const handleFullscreenToggle = () => {
        if (onFullscreenToggle) {
            onFullscreenToggle();
            return;
        }

        // Fallback keeps the control functional in isolated renders/tests.
        if (chartFullscreen) {
            document.exitFullscreen?.().catch(() => {});
        } else {
            document.documentElement.requestFullscreen?.().catch(() => {});
        }
    };

    useEffect(() => {
        const palette = {
            bg: readHexColorVar("--color-chart-bg-hex", DEFAULT_PALETTE.bg),
            textMuted: readHexColorVar("--color-text-muted-hex", DEFAULT_PALETTE.textMuted),
            grid: readHexColorVar("--color-chart-grid-hex", DEFAULT_PALETTE.grid),
            crosshair: readHexColorVar("--color-chart-crosshair-hex", DEFAULT_PALETTE.crosshair),
            bull: readHexColorVar("--color-bull-hex", DEFAULT_PALETTE.bull),
            bear: readHexColorVar("--color-bear-hex", DEFAULT_PALETTE.bear),
            vwap: readHexColorVar("--color-chart-vwap-hex", DEFAULT_PALETTE.vwap),
        };
        paletteRef.current = palette;
    }, []);

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

        const colors = paletteRef.current;
        const chart = createChart(container, {
            layout: {
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
                text: "NEXTBULL",
                color: "rgba(200,151,42,0.06)",
                fontSize: 36,
                horzAlign: "center",
                vertAlign: "center",
            },
        } as any);

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
            priceScaleId: "right",
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
        const { bull, bear } = paletteRef.current;

        const syncData = (state: any, prevState: any) => {
            const candleSeries = candleSeriesRef.current;
            const volumeSeries = volumeSeriesRef.current;
            if (!candleSeries || !volumeSeries) return;

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
        syncData(currentState, { candles: [], chartTimeframe: currentState.chartTimeframe });

        const unsubscribe = useTradingStore.subscribe(syncData);

        return () => { unsubscribe(); };
    }, []);

    // Subscribe to VWAP and maintain price line
    useEffect(() => {
        let vwapLine: IPriceLine | null = null;

        const syncVwap = (state: any, prevState: any = {}) => {
            if (
                prevState &&
                state.vwapNumerator === prevState.vwapNumerator &&
                state.vwapDenominator === prevState.vwapDenominator
            ) {
                return;
            }
            const candleSeries = candleSeriesRef.current;
            if (!candleSeries) return;

            const vwap = state.vwapDenominator > 0 ? state.vwapNumerator / state.vwapDenominator : null;
            if (vwap === null) return;
            
            if (!vwapLine) {
                vwapLine = candleSeries.createPriceLine({
                    price: vwap,
                    color: paletteRef.current.vwap,
                    lineWidth: 1,
                    lineStyle: 1,
                    axisLabelVisible: true,
                    title: "VWAP",
                });
            } else {
                vwapLine.applyOptions({ price: vwap });
            }
        };

        syncVwap(useTradingStore.getState());
        const unsubscribe = useTradingStore.subscribe(syncVwap);
        
        return () => { unsubscribe(); };
    }, []);

    // Subscribe to human fill markers and redraw full marker set
    useEffect(() => {
        const { bull, bear } = paletteRef.current;

        const syncMarkers = (state: any, prevState: any) => {
            if (prevState.fills && state.fills === prevState.fills) return;
            const markerApi = markerApiRef.current;
            if (!markerApi) return;

            const markers: SeriesMarker<Time>[] = state.fills.map((fill: any) => ({
                time: fill.time,
                position: fill.side === "buy" ? "belowBar" : "aboveBar",
                color: fill.side === "buy" ? bull : bear,
                shape: fill.side === "buy" ? "arrowUp" : "arrowDown",
                text: fill.side === "buy" ? `BUY ${fill.price.toFixed(4)}` : `SELL ${fill.price.toFixed(4)}`,
            }));

            markerApi.setMarkers(markers);
        };

        syncMarkers(useTradingStore.getState(), {});
        const unsubscribe = useTradingStore.subscribe(syncMarkers);

        return () => { unsubscribe(); };
    }, []);

    // Subscribe to drawing state and keep chart price lines in sync
    useEffect(() => {
        const { textMuted: lineColor } = paletteRef.current;

        const syncDrawings = (state: any, prevState: any) => {
            if (prevState.drawings && state.drawings === prevState.drawings) return;
            const candleSeries = candleSeriesRef.current;
            if (!candleSeries) return;

            const nextIds = new Set(state.drawings.map((d: any) => d.id));
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
        };

        syncDrawings(useTradingStore.getState(), {});
        const unsubscribe = useTradingStore.subscribe(syncDrawings);

        return () => { unsubscribe(); };
    }, []);

    return (
        <section className="panel grid h-full min-w-0 min-h-[clamp(300px,52vh,480px)] grid-rows-[auto_1fr]">
            <div className="panel-title flex items-center justify-between border-b border-border bg-bg-panel px-3 py-1.5 min-h-[36px]">
                <div className="flex gap-0.5" role="group" aria-label="Chart timeframe">
                    {TIMEFRAMES.map((tf) => (
                        <button
                            key={tf.label}
                            type="button"
                            onClick={() => setChartTimeframe(tf.seconds)}
                            aria-pressed={tf.seconds === chartTimeframe}
                            className={`touch-target-compact flex h-7 min-w-[32px] items-center justify-center rounded-xs px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors duration-100 ${tf.seconds === chartTimeframe
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
                            className="touch-target-compact inline-flex h-6 w-6 items-center justify-center rounded-xs border border-border bg-bg-row text-[12px] text-text-muted hover:text-text-primary transition-colors duration-100"
                        >
                            ⌘
                        </button>
                    )}
                    <button
                        type="button"
                        aria-label={chartFullscreen ? "Exit fullscreen chart" : "Toggle fullscreen chart"}
                        onClick={handleFullscreenToggle}
                        className="touch-target-compact inline-flex h-6 w-6 items-center justify-center rounded-xs border border-border bg-bg-row text-[12px] text-text-muted hover:text-text-primary transition-colors duration-100"
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
                    <div className="absolute inset-0 flex items-center justify-center bg-bg-row/80 text-[11px] uppercase tracking-[0.12em] text-text-muted">
                        Connecting
                    </div>
                )}
            </div>
        </section>
    );
}
