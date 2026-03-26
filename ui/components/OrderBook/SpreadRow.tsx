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

        pulseRef.current.classList.remove("spread-pulse");
        void pulseRef.current.offsetWidth;
        pulseRef.current.classList.add("spread-pulse");
    }, [bestAsk, bestBid]);

    return (
        <div
            ref={pulseRef}
            className="border-y border-spread bg-spread-bg px-2 py-0.5 text-center font-mono text-[10px] tracking-[0.06em] text-text-muted"
        >
            {bestBid && bestAsk
                ? <><span className="opacity-60">spread </span>{spread.toFixed(4)}<span className="ml-2 opacity-60">{spreadPct.toFixed(3)}%</span></>
                : "—"}
        </div>
    );
}
