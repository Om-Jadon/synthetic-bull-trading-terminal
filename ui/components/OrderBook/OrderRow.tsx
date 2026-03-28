"use client";

import { memo, useEffect, useRef } from "react";

type OrderRowProps = {
    price: number;
    size: number;
    totalSize: number;
    side: "bid" | "ask";
    depthPct: number;
    isBest?: boolean;
};

function OrderRow({
    price,
    size,
    totalSize,
    side,
    depthPct,
    isBest = false,
}: OrderRowProps) {
    const priceClass = side === "bid" ? "text-bull" : "text-bear";
    const prevSizeRef = useRef(size);
    const depthRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!depthRef.current) return;
        const prev = prevSizeRef.current;
        prevSizeRef.current = size;
        if (size <= prev) return;

        const node = depthRef.current;
        node.classList.remove("depth-flash");
        const raf = window.requestAnimationFrame(() => {
            node.classList.add("depth-flash");
        });
        return () => window.cancelAnimationFrame(raf);
    }, [size]);

    return (
        <div
            className={`book-row notice-enter relative grid h-[22px] shrink-0 grid-cols-3 items-center px-2 font-mono text-[11px] ${isBest ? "font-medium" : ""}`}
        >
            <div
                ref={depthRef}
                data-depth-bar
                className="pointer-events-none absolute inset-y-0 left-0 origin-left"
                style={{
                    width: "100%",
                    transform: `scaleX(${Math.max(0, Math.min(1, depthPct))})`,
                    backgroundColor:
                        side === "bid"
                            ? "var(--color-bull-depth)"
                            : "var(--color-bear-depth)",
                    willChange: "transform",
                    transition: "transform 200ms cubic-bezier(0.25, 0, 0.1, 1)",
                }}
            />
            <span className={`${priceClass} relative z-10 ${isBest ? "!font-semibold" : ""}`}>
                {price.toFixed(2)}
            </span>
            <span className="relative z-10 text-right text-text-primary">
                {size.toFixed(2)}
            </span>
            <span className="relative z-10 text-right text-text-muted">
                {totalSize.toFixed(2)}
            </span>
        </div>
    );
}

export default memo(OrderRow);
