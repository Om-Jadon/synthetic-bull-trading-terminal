"use client";

import { useEffect, useRef } from "react";


type SpreadRowProps = {
    bestBid?: number;
    bestAsk?: number;
};

export default function SpreadRow({ bestBid, bestAsk }: SpreadRowProps) {
    const pulseRef = useRef<HTMLDivElement | null>(null);
    const spread = bestBid && bestAsk ? bestAsk - bestBid : 0;
    const spreadPct = bestBid && bestAsk && bestBid > 0 ? (spread / bestBid) * 100 : 0;

    useEffect(() => {
        if (!pulseRef.current) {
            return;
        }

        const node = pulseRef.current;
        node.classList.remove("spread-pulse");
        const raf = window.requestAnimationFrame(() => {
            node.classList.add("spread-pulse");
        });
        return () => window.cancelAnimationFrame(raf);
    }, [bestAsk, bestBid]);

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
            <div className="px-2 pb-1.5">
                <div className="relative h-[4px] w-full overflow-hidden rounded-[1px] bg-bg-row">
                    <div className="absolute inset-y-0 left-0 w-1/2 bg-bull/80" />
                    <div className="absolute inset-y-0 right-0 w-1/2 bg-bear/80" />
                </div>
            </div>
        </div>
    );
}
