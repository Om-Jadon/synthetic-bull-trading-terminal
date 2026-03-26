"use client";

import { useEffect, useRef, useState } from "react";

import { placeOrder } from "@/lib/api";
import { useTradingStore } from "@/store/tradingStore";
import type { OrderRequest } from "@/types/ws";

const priceFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

import OpenOrders from "./OpenOrders";

type Toast = { id: number; message: string; ok: boolean };

let toastSeq = 0;

export default function OrderEntry() {
    const trackOrderId = useTradingStore((state) => state.trackOrderId);
    const snapshotReady = useTradingStore((state) => state.snapshotReady);
    const asks = useTradingStore((state) => state.asks);
    const bids = useTradingStore((state) => state.bids);

    const [type, setType] = useState<OrderRequest["type"]>("limit");
    const [side, setSide] = useState<OrderRequest["side"]>("buy");
    const [price, setPrice] = useState("100");
    const [size, setSize] = useState("1");
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const quickSizes = ["0.50", "1.00", "2.00", "5.00"];
    const timerRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

    const pushToast = (message: string, ok: boolean) => {
        const id = ++toastSeq;
        setToasts((prev) => [...prev, { id, message, ok }]);
        const timer = setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
            timerRefs.current.delete(id);
        }, 3000);
        timerRefs.current.set(id, timer);
    };

    useEffect(() => {
        const timers = timerRefs.current;
        return () => {
            timers.forEach((t) => clearTimeout(t));
        };
    }, []);

    const submitOrder = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitting(true);

        try {
            const payload: OrderRequest = {
                type,
                side,
                size: Number(size),
                ...(type === "limit" ? { price: Number(price) } : {}),
            };

            const response = await placeOrder(payload);
            trackOrderId(response.order_id);
            setErrorMsg(null);
            pushToast(`${side.toUpperCase()} accepted`, true);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Order rejected";
            setErrorMsg(msg);
            pushToast("Order rejected", false);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="grid h-full grid-rows-[auto_1fr] gap-2">
            <section className="panel px-2 py-2">
                <div className="panel-title mb-2 border-0 p-0">Order Entry</div>
                <div className="mb-2 grid grid-cols-2 gap-1" role="group" aria-label="Order type">
                    {(["market", "limit"] as const).map((item) => (
                        <button
                            key={item}
                            type="button"
                            onClick={() => setType(item)}
                            aria-pressed={type === item}
                            className={`order-chip h-11 rounded-[3px] border px-2 text-xs uppercase tracking-[0.08em] ${type === item
                                ? "border-border bg-bg-row text-text-primary"
                                : "border-border text-text-muted"
                                }`}
                        >
                            {item}
                        </button>
                    ))}
                </div>

                <div className="mb-2 grid grid-cols-2 gap-1" role="group" aria-label="Order side">
                    {(["buy", "sell"] as const).map((item) => (
                        <button
                            key={item}
                            type="button"
                            onClick={() => setSide(item)}
                            aria-pressed={side === item}
                            className={`order-chip h-11 rounded-[3px] border px-2 text-xs uppercase tracking-[0.08em] ${side === item
                                ? item === "buy"
                                    ? "border-bull bg-bull-surface text-bull"
                                    : "border-bear bg-bear-surface text-bear"
                                : "border-border text-text-muted"
                                }`}
                        >
                            {item}
                        </button>
                    ))}
                </div>

                <form className="space-y-2.5" onSubmit={submitOrder}>
                    {type === "limit" && (
                        <label className="block text-[13px] text-text-muted">
                            Price
                            <input
                                value={price}
                                onChange={(event) => setPrice(event.target.value)}
                                type="number"
                                step="0.0001"
                                min="0"
                                className="mt-1 h-10 w-full rounded-[3px] border border-border bg-bg-row px-2 font-mono text-[13px] text-text-primary"
                            />
                        </label>
                    )}

                    {type === "market" && (
                        <div className="flex items-center justify-between rounded-[3px] border border-border bg-bg-row px-2 py-2 font-mono text-[11px]">
                            <span className="text-text-muted">Est. fill</span>
                            <span className="text-text-primary">
                                {side === "buy"
                                    ? asks[0] ? `~$${priceFormatter.format(asks[0][0])}` : "—"
                                    : bids[0] ? `~$${priceFormatter.format(bids[0][0])}` : "—"}
                            </span>
                        </div>
                    )}

                    <label className="block text-[13px] text-text-muted">
                        Size
                        <input
                            value={size}
                            onChange={(event) => setSize(event.target.value)}
                            type="number"
                            step="0.01"
                            min="0"
                            className="mt-1 h-10 w-full rounded-[3px] border border-border bg-bg-row px-2 font-mono text-[13px] text-text-primary"
                        />
                    </label>

                    <div className="grid grid-cols-4 gap-1">
                        {quickSizes.map((quick) => (
                            <button
                                key={quick}
                                type="button"
                                onClick={() => setSize(quick)}
                                aria-label={`Set size to ${quick}`}
                                className="order-chip h-9 rounded-[3px] border border-border bg-bg-row px-1 font-mono text-[11px] text-text-muted"
                            >
                                {quick}
                            </button>
                        ))}
                    </div>

                    <button
                        type="submit"
                        disabled={submitting || !snapshotReady}
                        className={`order-submit h-11 w-full rounded-[3px] font-semibold uppercase tracking-[0.08em] text-bg-primary ${side === "buy" ? "bg-bull" : "bg-bear"
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                        {submitting ? "Sending" : snapshotReady ? `Place ${side}` : "Waiting"}
                    </button>

                    {errorMsg && (
                        <p role="alert" className="text-[11px] text-bear">
                            {errorMsg}
                        </p>
                    )}
                </form>

                {!snapshotReady && (
                    <div role="status" aria-live="polite" className="mt-2 min-h-4 text-[11px] text-text-muted">
                        Waiting for market snapshot
                    </div>
                )}
            </section>

            <OpenOrders />

            {/* Bottom-right toast portal */}
            <div
                aria-live="polite"
                className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
            >
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        role="status"
                        className={`notice-enter pointer-events-auto rounded-[3px] border px-3 py-2 font-mono text-[12px] ${toast.ok
                                ? "border-bull/40 bg-bull-surface text-bull"
                                : "border-bear/40 bg-bear-surface text-bear"
                            }`}
                    >
                        {toast.message}
                    </div>
                ))}
            </div>
        </div>
    );
}
