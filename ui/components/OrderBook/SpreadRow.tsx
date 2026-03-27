"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useTradingStore } from "@/store/tradingStore";

type SpreadRowProps = {
    bestBid?: number;
    bestAsk?: number;
};

export default function SpreadRow({ bestBid, bestAsk }: SpreadRowProps) {
    const pulseRef = useRef<HTMLDivElement | null>(null);
    const trades = useTradingStore((state) => state.trades);
    const buyPressure = useMemo(() => {
        let buy = 0;
        let sell = 0;
        for (const trade of trades) {
            if (trade.side === "buy") buy += trade.size;
            else sell += trade.size;
        }
        const total = buy + sell;
        return total > 0 ? buy / total : 0.5;
    }, [trades]);
    const pressureRef = useRef(buyPressure);
    pressureRef.current = buyPressure;
    const [displayPressure, setDisplayPressure] = useState(0.5);
    const spread = bestBid && bestAsk ? bestAsk - bestBid : 0;
    const spreadPct = bestBid && bestAsk && bestBid > 0 ? (spread / bestBid) * 100 : 0;

    useEffect(() => {
        if (!pulseRef.current) {
            return;
        }

        pulseRef.current.classList.remove("spread-pulse");
        void pulseRef.current.offsetWidth;
        pulseRef.current.classList.add("spread-pulse");
    }, [bestAsk, bestBid]);

    useEffect(() => {
        setDisplayPressure(pressureRef.current);
        const timer = window.setInterval(() => {
            setDisplayPressure(pressureRef.current);
        }, 1000);
        return () => window.clearInterval(timer);
    }, [setDisplayPressure]);

    const buyPct = Math.round(displayPressure * 100);
    const sellPct = 100 - buyPct;

    return (
        <div className="border-y border-spread bg-spread-bg">
            <div
                ref={pulseRef}
                className="px-2 py-0.5 text-center font-mono text-[10px] tracking-[0.06em] text-text-muted"
            >
                {bestBid && bestAsk
                    ? <><span className="opacity-60">spread </span>{spread.toFixed(4)}<span className="ml-2 opacity-60">{spreadPct.toFixed(3)}%</span></>
                    : "—"}
            </div>
            <div className="px-2 pb-1">
                <div className="relative h-1.5 overflow-hidden rounded-xs bg-bg-row">
                    <div
                        className="absolute inset-0 origin-left bg-bull transition-transform duration-300 ease-[cubic-bezier(0.25,0,0.1,1)]"
                        style={{ transform: `scaleX(${displayPressure})` }}
                    />
                    <div
                        className="absolute inset-0 origin-right bg-bear transition-transform duration-300 ease-[cubic-bezier(0.25,0,0.1,1)]"
                        style={{ transform: `scaleX(${1 - displayPressure})` }}
                    />
                </div>
                <div className="mt-0.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.08em] text-text-muted">
                    <span>Buy {buyPct}%</span>
                    <span>Sell {sellPct}%</span>
                </div>
            </div>
        </div>
    );
}
