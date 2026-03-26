"use client";

import { useTradingStore } from "@/store/tradingStore";

type AssetBarProps = {
    priceRef: React.RefObject<HTMLSpanElement | null>;
    priceFlashRef: React.RefObject<HTMLDivElement | null>;
    directionRef: React.RefObject<HTMLSpanElement | null>;
};

export default function AssetBar({ priceRef, priceFlashRef, directionRef }: AssetBarProps) {
    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const changePct = useTradingStore((state) => state.changePct);
    const sessionVolume = useTradingStore((state) => state.sessionVolume);
    const sessionHigh = useTradingStore((state) => state.sessionHigh);
    const sessionLow = useTradingStore((state) => state.sessionLow);
    const connectionStatus = useTradingStore((state) => state.connectionStatus);

    const isUp = changePct >= 0;
    const statusTone =
        connectionStatus === "open"
            ? "text-bull"
            : connectionStatus === "closed"
              ? "text-bear"
              : "text-text-muted";

    return (
        <header className="h-10 shrink-0 border-b border-border bg-bg-panel px-3">
            <div className="flex h-full items-center justify-between gap-4">
                {/* Left: brand + pair + price */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 border-r border-border pr-3 font-semibold tracking-[0.18em] text-brand">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
                        <span>NEXTBULL</span>
                    </div>

                    <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
                        BULL/USDC
                    </span>

                    <div
                        ref={priceFlashRef}
                        className="ticker-flash flex items-baseline gap-1 rounded-xs border border-border bg-bg-row px-2 py-0.5 font-mono"
                    >
                        <span className="text-[11px] text-text-muted">$</span>
                        <span ref={priceRef} className="text-xl font-semibold text-text-primary">
                            {snapshotReady ? "0.0000" : "—"}
                        </span>
                        <span ref={directionRef} className="text-[13px] text-text-muted" aria-hidden="true" />
                    </div>

                    <span className={`font-mono text-[12px] font-medium ${isUp ? "text-bull" : "text-bear"}`}>
                        {snapshotReady ? `${isUp ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
                    </span>
                </div>

                {/* Center: session stats */}
                <div className="hidden items-center gap-4 font-mono text-[11px] md:flex">
                    <span className="text-text-muted">
                        H{" "}
                        <span className="text-text-primary">
                            {snapshotReady ? sessionHigh.toFixed(4) : "—"}
                        </span>
                    </span>
                    <span className="text-text-muted">
                        L{" "}
                        <span className="text-text-primary">
                            {snapshotReady ? sessionLow.toFixed(4) : "—"}
                        </span>
                    </span>
                    <span className="text-text-muted">
                        Vol{" "}
                        <span className="text-text-primary">
                            {snapshotReady ? sessionVolume.toFixed(2) : "—"}
                        </span>
                    </span>
                </div>

                {/* Right: status */}
                <div className="flex items-center gap-2">
                    <span className="hidden rounded-xs border border-border bg-bg-row px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-text-muted sm:inline-block">
                        Sim
                    </span>
                    <span
                        role="status"
                        aria-live="polite"
                        aria-label={`Connection status: ${connectionStatus}`}
                        className={`inline-flex items-center gap-1.5 rounded-xs border border-border bg-bg-row px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${statusTone}`}
                    >
                        <span
                            className={`status-dot inline-block h-1.5 w-1.5 rounded-full ${
                                connectionStatus === "open"
                                    ? "bg-bull"
                                    : connectionStatus === "closed"
                                      ? "bg-bear"
                                      : "bg-text-muted"
                            }`}
                        />
                        {connectionStatus}
                    </span>
                </div>
            </div>
        </header>
    );
}
