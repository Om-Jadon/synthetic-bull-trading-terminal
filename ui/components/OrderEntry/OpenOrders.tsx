"use client";

import { useMemo } from "react";

import { cancelOrder } from "@/lib/api";
import { useTradingStore } from "@/store/tradingStore";

export default function OpenOrders() {
    const openOrders = useTradingStore((state) => state.openOrders);
    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const orders = useMemo(() => Array.from(openOrders.values()), [openOrders]);

    const onCancel = async (orderId: string) => {
        try {
            await cancelOrder(orderId);
        } catch {
            return;
        }
    };

    return (
        <section className="flex h-full min-h-0 flex-col">
            <div className="panel-scroller min-h-0 flex-1 overflow-auto px-2 py-2">
                {!snapshotReady ? (
                    <div role="status" aria-live="polite" className="text-label text-brand/80">Connecting</div>
                ) : orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center is-live">
                        <p className="font-mono text-data text-text-muted terminal-panel panel-delay-1">No open orders</p>
                        <p className="font-mono text-micro text-text-muted/60 leading-relaxed terminal-panel panel-delay-2">
                            Use <span className="text-text-muted">Order Entry</span> above to place a trade
                        </p>
                        <div className="mt-1 flex items-center gap-2 font-mono text-micro text-text-muted/50 terminal-panel panel-delay-3">
                            <kbd className="rounded-xs border border-border bg-bg-panel px-1 py-0.5 text-micro">B</kbd>
                            <span>buy</span>
                            <span className="text-border">·</span>
                            <kbd className="rounded-xs border border-border bg-bg-panel px-1 py-0.5 text-micro">S</kbd>
                            <span>sell</span>
                            <span className="text-border">·</span>
                            <kbd className="rounded-xs border border-border bg-bg-panel px-1 py-0.5 text-micro">↵</kbd>
                            <span>submit</span>
                        </div>
                    </div>
                ) : (
                    orders.map((order) => (
                        <div key={order.order_id} className="order-chip mb-1.5 grid grid-cols-[1fr_auto] items-center gap-2 rounded-xs border border-border bg-bg-row p-2">
                            <div className="font-mono text-data">
                                <div className={order.side === "buy" ? "text-bull" : "text-bear"}>
                                    {order.side.toUpperCase()} {order.price.toFixed(4)}
                                </div>
                                <div className="text-text-muted">
                                    Remaining {order.remaining_size.toFixed(2)}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => onCancel(order.order_id)}
                                aria-label={`Cancel ${order.side} order, ${order.remaining_size.toFixed(2)} remaining at ${order.price.toFixed(4)}`}
                                className="h-9 btn-tactile rounded-xs border border-border bg-bg-panel px-2 text-label text-text-muted hover:border-bear/50 hover:text-bear"
                            >
                                Cancel
                            </button>
                        </div>
                    ))
                )}
            </div>
        </section>
    );
}
