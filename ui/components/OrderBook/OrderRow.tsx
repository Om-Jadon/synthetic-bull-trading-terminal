"use client";

import { memo, useEffect, useRef } from "react";
import { useTradingStore } from "@/store/tradingStore";

type OrderRowProps = {
    price: number;
    size: number;
    totalSize: number;
    side: "bid" | "ask";
    depthPct: number;
};

function OrderRow({
    price,
    size,
    totalSize,
    side,
    depthPct,
}: OrderRowProps) {
    const setPendingPriceFill = useTradingStore((state) => state.setPendingPriceFill);

    const onRowClick = () => {
        setPendingPriceFill(price, side === "bid" ? "buy" : "sell");
    };

    const hasLiquidity = size > 0;
    const priceClass = hasLiquidity
        ? (side === "bid" ? "text-bull" : "text-bear")
        : "text-text-muted/40";
    
    const prevSizeRef = useRef(size);
    const depthRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!depthRef.current) return;
        const prev = prevSizeRef.current;
        prevSizeRef.current = size;
        
        // Only flash on significant size increases (>5%) to reduce jitter/noise
        const isSignificantIncrease = prev > 0 && (size - prev) / prev > 0.05;
        if (!isSignificantIncrease) return;

        const node = depthRef.current;
        node.classList.remove("depth-flash");
        const raf = window.requestAnimationFrame(() => {
            node.classList.add("depth-flash");
        });
        return () => window.cancelAnimationFrame(raf);
    }, [size]);

    return (
        <div
            role="button"
            tabIndex={hasLiquidity ? 0 : -1}
            aria-label={`${side === "bid" ? "Buy" : "Sell"} at ${price.toFixed(2)}`}
            onClick={onRowClick}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(); } }}
            className="book-row book-row-reflow relative grid h-[22px] max-md:h-8 shrink-0 cursor-pointer grid-cols-[5fr_3fr_3fr] gap-x-1 items-center px-2 max-sm:px-1 font-mono text-label max-md:text-data hover:bg-bg-row active:bg-brand/10"
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
                    transition: "transform 100ms cubic-bezier(0.25, 0, 0.1, 1)",
                    opacity: hasLiquidity ? 1 : 0,
                }}
            />
            <span className={`${priceClass} relative z-10`}>
                {price.toFixed(2)}
            </span>
            <span className={`relative z-10 text-right text-text-primary ${!hasLiquidity ? "opacity-20" : ""}`}>
                {size.toFixed(2)}
            </span>
            <span className={`relative z-10 text-right text-text-muted ${!hasLiquidity ? "opacity-5" : ""}`}>
                {totalSize.toFixed(2)}
            </span>
        </div>
    );
}

export default memo(OrderRow);
