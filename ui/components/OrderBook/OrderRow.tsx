"use client";

import { useEffect, useRef } from "react";

type OrderRowProps = {
    price: number;
    size: number;
    totalSize: number;
    side: "bid" | "ask";
    depthPct: number;
    exiting?: boolean;
};

export default function OrderRow({ price, size, totalSize, side, depthPct, exiting = false }: OrderRowProps) {
    const priceClass = side === "bid" ? "text-bull" : "text-bear";
    const prevSizeRef = useRef(size);
    const depthRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!depthRef.current) return;
        const prev = prevSizeRef.current;
        prevSizeRef.current = size;
        if (size <= prev) return;

        depthRef.current.classList.remove("depth-flash");
        void depthRef.current.offsetWidth;
        depthRef.current.classList.add("depth-flash");
    }, [size]);

    return (
        <div className={`book-row relative grid h-[18px] grid-cols-3 items-center px-2 font-mono text-[11px] ${exiting ? "book-row-exit" : "book-row-enter"}`}>
            <div
                ref={depthRef}
                data-depth-bar
                className="pointer-events-none absolute inset-y-0 left-0 origin-left transition-[transform] duration-[120ms]"
                style={{
                    width: "100%",
                    transform: `scaleX(${Math.max(0, Math.min(1, depthPct))})`,
                    backgroundColor:
                        side === "bid"
                            ? "var(--color-bull-depth)"
                            : "var(--color-bear-depth)",
                    willChange: "transform",
                    transitionTimingFunction: "cubic-bezier(0.25, 0, 0.1, 1)",
                }}
            />
            <span className={`${priceClass} relative z-10`}>{price.toFixed(4)}</span>
            <span className="relative z-10 text-right text-text-primary">{size.toFixed(2)}</span>
            <span className="relative z-10 text-right text-text-muted">{totalSize.toFixed(2)}</span>
        </div>
    );
}
