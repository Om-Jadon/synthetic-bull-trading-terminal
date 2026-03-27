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
                    <div role="status" aria-live="polite" className="text-xs uppercase tracking-[0.12em] text-text-muted">Connecting</div>
                ) : orders.length === 0 ? (
                    <div className="text-xs text-text-muted">No resting orders</div>
                ) : (
                    orders.map((order) => (
                        <div key={order.order_id} className="order-chip mb-1.5 grid grid-cols-[1fr_auto] items-center gap-2 rounded-xs border border-border bg-bg-row p-2">
                            <div className="font-mono text-[11px]">
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
                                className="h-9 rounded-xs border border-border bg-bg-panel px-2 text-[10px] uppercase tracking-[0.08em] text-text-muted hover:bg-neutral-hover"
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
