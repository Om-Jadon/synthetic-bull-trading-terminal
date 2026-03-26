"use client";

type OrderRowProps = {
    price: number;
    size: number;
    totalSize: number;
    side: "bid" | "ask";
    depthPct: number;
};

export default function OrderRow({ price, size, totalSize, side, depthPct }: OrderRowProps) {
    const priceClass = side === "bid" ? "text-bull" : "text-bear";

    return (
        <div className="book-row relative grid h-[18px] grid-cols-3 items-center px-2 font-mono text-[11px]">
            <div
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
