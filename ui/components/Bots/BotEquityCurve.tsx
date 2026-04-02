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

type BotEquityCurveProps = {
  userId: string;
  color: string;
};

export default function BotEquityCurve({ userId, color }: BotEquityCurveProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const botPortfolios = useTradingStore((state) => state.botPortfolios);
  const isActive = botPortfolios.has(userId);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ attributionLogo: false } as any),
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#746d6a",
        fontFamily: "var(--font-jetbrains)",
      },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      grid: {
        vertLines: { visible: false, color: "transparent" },
        horzLines: { visible: false, color: "transparent" },
      },
      crosshair: {
        vertLine: { visible: false, color: "transparent" },
        horzLine: { visible: false, color: "transparent" },
      },
      timeScale: { visible: false, borderVisible: false },
      handleScroll: false,
      handleScale: false,
      autoSize: true,
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color,
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
  }, [color]);

  useEffect(() => {
    const render = (history: Array<{ time: UTCTimestamp; value: number }>) => {
      const series = lineSeriesRef.current;
      if (!series) return;
      series.setData(history.map((p) => ({ time: p.time, value: p.value })));
    };

    render(useTradingStore.getState().botEquityHistory.get(userId) ?? []);

    const unsubscribe = useTradingStore.subscribe((state, prev) => {
      if (state.botEquityHistory === prev.botEquityHistory) return;
      const history = state.botEquityHistory.get(userId);
      if (history) render(history);
    });

    return () => unsubscribe();
  }, [userId]);

  return (
    <div className="relative h-[60px] w-full">
      <div ref={containerRef} className="h-full w-full" />
      {!isActive && (
        <div className="absolute inset-0 grid place-items-center bg-bg-panel/80 font-mono text-micro uppercase tracking-widest text-text-muted">
          Connecting
        </div>
      )}
    </div>
  );
}
