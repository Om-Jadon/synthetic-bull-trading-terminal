"use client";

import { useEffect, useRef } from "react";
import {
    CandlestickSeries,
    ColorType,
    createChart,
    HistogramSeries,
    type ISeriesApi,
    type UTCTimestamp,
} from "lightweight-charts";

import { useTradingStore } from "@/store/tradingStore";

function readColorVar(name: string, fallback: string): string {
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
}

export default function CandlestickChart() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

    const snapshotReady = useTradingStore((state) => state.snapshotReady);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

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

        return () => {
            chart.remove();
            candleSeriesRef.current = null;
            volumeSeriesRef.current = null;
        };
    }, []);

    useEffect(() => {
        const bull = readColorVar("--color-bull", "#26a69a");
        const bear = readColorVar("--color-bear", "#ef5350");

        const unsubscribe = useTradingStore.subscribe((state, prevState) => {
            const candleSeries = candleSeriesRef.current;
            const volumeSeries = volumeSeriesRef.current;
            if (!candleSeries || !volumeSeries) {
                return;
            }

            const candles = state.candles;
            const prevCandles = prevState.candles;
            if (candles.length === 0) {
                return;
            }

            const last = candles[candles.length - 1];
            const lastColor = last.close >= last.open ? bull : bear;

            if (prevCandles.length === 0 || candles.length < prevCandles.length) {
                candleSeries.setData(
                    candles.map((candle) => ({
                        time: candle.time as UTCTimestamp,
                        open: candle.open,
                        high: candle.high,
                        low: candle.low,
                        close: candle.close,
                    })),
                );
                volumeSeries.setData(
                    candles.map((candle) => ({
                        time: candle.time as UTCTimestamp,
                        value: candle.volume,
                        color: candle.close >= candle.open ? bull + "88" : bear + "88",
                    })),
                );
                return;
            }

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

        return () => {
            unsubscribe();
        };
    }, []);

    return (
        <section className="panel h-full min-h-[clamp(240px,42vh,360px)]">
            <div className="panel-title">Candles 1s</div>
            <div className="relative h-[calc(100%-28px)] w-full">
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
