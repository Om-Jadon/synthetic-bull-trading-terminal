"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cancelOrder, placeOrder } from "@/lib/api";
import * as sounds from "@/lib/sound";
import { useTradingStore } from "@/store/tradingStore";
import type { OrderRequest } from "@/types/ws";

const priceFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const moneyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function estimateMarketFill(
  side: "buy" | "sell",
  size: number,
  asks: [number, number][],
  bids: [number, number][],
  lastPrice: number,
): {
  avgPrice: number;
  slippage: number;
  levelsUsed: number;
  partial: boolean;
} | null {
  if (!(size > 0)) return null;
  const levels = side === "buy" ? asks : bids;
  if (levels.length === 0) return null;

  let remaining = size;
  let totalCost = 0;
  let levelsUsed = 0;

  for (const [price, volume] of levels) {
    if (remaining <= 0) break;
    if (!(volume > 0)) continue;
    const fill = Math.min(remaining, volume);
    totalCost += price * fill;
    remaining -= fill;
    levelsUsed += 1;
  }

  const filled = size - remaining;
  if (filled <= 0) return null;

  const avgPrice = totalCost / filled;
  const refPrice = lastPrice > 0 ? lastPrice : avgPrice;
  const slippage =
    refPrice > 0 ? (Math.abs(avgPrice - refPrice) / refPrice) * 100 : 0;

  return { avgPrice, slippage, levelsUsed, partial: remaining > 0 };
}



type Toast = { id: number; message: string; ok: boolean };

let toastSeq = 0;

// Module-level constant — stable reference, no re-creation on render
const QUICK_SIZES = ["0.50", "1.00", "2.00", "5.00"];

export default function OrderEntry() {
  const trackOrderId = useTradingStore((state) => state.trackOrderId);
  const snapshotReady = useTradingStore((state) => state.snapshotReady);
  const asks = useTradingStore((state) => state.asks);
  const bids = useTradingStore((state) => state.bids);
  const lastPrice = useTradingStore((state) => state.lastPrice);
  const portfolio = useTradingStore((state) => state.portfolio);
  const openOrders = useTradingStore((state) => state.openOrders);

  const [type, setType] = useState<OrderRequest["type"]>("limit");
  const [side, setSide] = useState<OrderRequest["side"]>("buy");
  const [price, setPrice] = useState("100");
  const [size, setSize] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showHint, setShowHint] = useState(false);
  const [keyFlash, setKeyFlash] = useState<string | null>(null);

  const timerRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const hintShownRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always-fresh refs — updated every render, no stale closure risk
  const openOrdersRef = useRef(openOrders);
  openOrdersRef.current = openOrders;

  const pushToast = useCallback((message: string, ok: boolean) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { id, message, ok }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timerRefs.current.delete(id);
    }, 3000);
    timerRefs.current.set(id, timer);
  }, []);

  const pushToastRef = useRef(pushToast);
  pushToastRef.current = pushToast;

  // Brief ring flash on keyboard shortcut press
  const flash = useCallback((key: string) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setKeyFlash(key);
    flashTimerRef.current = setTimeout(() => setKeyFlash(null), 200);
  }, []);

  useEffect(() => {
    const timers = timerRefs.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  // Show hotkey hint once, 4 seconds after snapshot arrives
  useEffect(() => {
    if (!snapshotReady || hintShownRef.current) return;
    hintShownRef.current = true;
    setShowHint(true);
    const t = setTimeout(() => setShowHint(false), 4000);
    return () => clearTimeout(t);
  }, [snapshotReady]);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Never interfere with Cmd/Ctrl shortcuts (Cmd+K etc.)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Escape: always works — blur focused input, or reset form
      if (e.key === "Escape") {
        const active = document.activeElement;
        if (
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement
        ) {
          active.blur();
        } else {
          setPrice("100");
          setSize("1");
          setErrorMsg(null);
        }
        return;
      }

      // All other shortcuts: only fire when not typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const k = e.key.toLowerCase();
      switch (k) {
        case "b":
          e.preventDefault();
          setSide("buy");
          flash("buy");
          break;

        case "s":
          e.preventDefault();
          setSide("sell");
          flash("sell");
          break;

        case "m":
          e.preventDefault();
          setType("market");
          flash("market");
          break;

        case "l":
          e.preventDefault();
          setType("limit");
          flash("limit");
          break;

        case "1":
        case "2":
        case "3":
        case "4": {
          e.preventDefault();
          const idx = parseInt(k) - 1;
          setSize(QUICK_SIZES[idx]);
          flash(`size-${k}`);
          break;
        }

        case "enter":
          e.preventDefault();
          flash("submit");
          formRef.current?.requestSubmit();
          break;

        case "c": {
          if (!e.shiftKey) break; // plain C — ignore
          e.preventDefault();
          const orders = [...openOrdersRef.current.values()];
          if (orders.length === 0) break;
          flash("cancel");
          void Promise.all(orders.map((o) => cancelOrder(o.order_id)));
          const n = orders.length;
          pushToastRef.current(
            `Cancelling ${n} order${n !== 1 ? "s" : ""}`,
            false,
          );
          break;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [flash]);

  const submitOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMsg(null);
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
      sounds.orderSubmit();
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

  // Reusable flash ring class — brief bull-teal ring on keyboard shortcut press
  const ringClass = (key: string) =>
    keyFlash === key ? "ring-1 ring-bull" : "";

  const sizeNum = Number(size);
  const limitPriceNum = Number(price);
  const marketEst =
    type === "market"
      ? estimateMarketFill(side, sizeNum, asks, bids, lastPrice)
      : null;
  const effectivePrice =
    type === "market"
      ? (marketEst?.avgPrice ??
        (side === "buy" ? asks[0]?.[0] : bids[0]?.[0]) ??
        lastPrice)
      : limitPriceNum;
  const notional =
    sizeNum > 0 && effectivePrice > 0 ? sizeNum * effectivePrice : 0;
  const equityPct =
    portfolio && portfolio.equity > 0
      ? (notional / portfolio.equity) * 100
      : null;

  return (
    <>
      <section className="panel px-2 py-2">
        <div className="panel-title mb-2 border-0 p-0">Order Entry</div>
        <div
          className="mb-2 grid grid-cols-2 gap-1"
          role="group"
          aria-label="Order type"
        >
          {(["market", "limit"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setType(item)}
              aria-pressed={type === item}
              className={`order-chip h-8 rounded-xs border px-2 text-xs uppercase tracking-[0.08em] transition-shadow duration-150 ${type === item
                  ? "border-border bg-bg-row text-text-primary"
                  : "border-border text-text-muted"
                } ${ringClass(item)}`}
            >
              {item}
            </button>
          ))}
        </div>

        <div
          className="mb-2 grid grid-cols-2 gap-1"
          role="group"
          aria-label="Order side"
        >
          {(["buy", "sell"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setSide(item)}
              aria-pressed={side === item}
              className={`order-chip h-8 rounded-xs border px-2 text-xs uppercase tracking-[0.08em] transition-shadow duration-150 ${side === item
                  ? item === "buy"
                    ? "border-bull bg-bull-surface text-bull"
                    : "border-bear bg-bear-surface text-bear"
                  : "border-border text-text-muted"
                } ${ringClass(item)}`}
            >
              {item}
            </button>
          ))}
        </div>

        <p className="mb-2 text-center font-mono text-[10px] text-text-muted/50 tracking-[0.04em]">
            Post Only · Reduce Only — not available in simulation
          </p>

        <form ref={formRef} className="space-y-2.5" onSubmit={submitOrder}>
          {type === "limit" && (
            <label className="block text-[13px] text-text-muted">
              Price
              <input
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                type="number"
                step="0.0001"
                min="0"
                className="mt-1 h-9 w-full rounded-xs border border-border bg-bg-row px-2 font-mono text-[13px] text-text-primary"
              />
            </label>
          )}

          {type === "market" && (
            <div className="flex items-center justify-between rounded-xs border border-border bg-bg-row px-2 py-2 font-mono text-[11px]">
              <span className="text-text-muted">Est. fill</span>
              {marketEst ? (
                <span className="text-text-primary">
                  {`$${priceFormatter.format(marketEst.avgPrice)} avg (${marketEst.slippage.toFixed(2)}% slip) · ${marketEst.levelsUsed} lvls${marketEst.partial ? " · partial" : ""}`}
                </span>
              ) : (
                <span className="text-text-primary">—</span>
              )}
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
              className="mt-1 h-9 w-full rounded-xs border border-border bg-bg-row px-2 font-mono text-[13px] text-text-primary"
            />
          </label>

          <div className="font-mono text-[10px] text-text-muted">
            {equityPct !== null && notional > 0
              ? `~${equityPct.toFixed(1)}% of capital  ·  $${moneyFormatter.format(notional)} notional  ·  Fee ~$${(notional * 0.001).toFixed(2)}`
              : "—"}
          </div>

          <div className="grid grid-cols-4 gap-1">
            {QUICK_SIZES.map((quick, i) => (
              <button
                key={quick}
                type="button"
                onClick={() => setSize(quick)}
                aria-label={`Set size to ${quick}`}
                className={`order-chip relative h-7 rounded-xs border border-border bg-bg-row px-1 font-mono text-[11px] text-text-muted transition-shadow duration-150 after:absolute after:-inset-y-1 after:-inset-x-0 sm:after:hidden ${ringClass(`size-${i + 1}`)}`}
              >
                {quick}
              </button>
            ))}
          </div>

          {showHint && (
            <div
              aria-hidden="true"
              className="notice-enter flex items-center justify-center gap-2 font-mono text-[10px] text-text-muted transition-opacity duration-500"
            >
              <span>
                <kbd className="rounded-xs border border-border px-1 py-0.5 text-[9px]">
                  ⌘K
                </kbd>
              </span>
              <span className="text-border">·</span>
              <span>
                <kbd className="rounded-xs border border-border px-1 py-0.5 text-[9px]">
                  B
                </kbd>{" "}
                buy
              </span>
              <span className="text-border">·</span>
              <span>
                <kbd className="rounded-xs border border-border px-1 py-0.5 text-[9px]">
                  S
                </kbd>{" "}
                sell
              </span>
              <span className="text-border">·</span>
              <span>
                <kbd className="rounded-xs border border-border px-1 py-0.5 text-[9px]">
                  ↵
                </kbd>{" "}
                submit
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !snapshotReady}
            className={`order-submit h-11 w-full rounded-xs font-semibold uppercase tracking-[0.08em] text-bg-primary transition-shadow duration-150 ${side === "buy" ? "bg-bull" : "bg-bear"
              } disabled:cursor-not-allowed disabled:opacity-60 ${ringClass("submit")}`}
          >
            {submitting
              ? "Sending"
              : snapshotReady
                ? `Place ${side}`
                : "Waiting"}
          </button>

          {errorMsg && (
            <p role="alert" className="text-[11px] text-bear">
              {errorMsg}
            </p>
          )}
        </form>

        {!snapshotReady && (
          <div
            role="status"
            aria-live="polite"
            className="mt-2 min-h-4 text-[11px] text-text-muted"
          >
            Waiting for market snapshot
          </div>
        )}
      </section>


      {/* Bottom-right toast portal */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`notice-enter pointer-events-auto rounded-xs border px-3 py-2 font-mono text-[12px] ${toast.ok
                ? "border-bull/40 bg-bull-surface text-bull"
                : "border-bear/40 bg-bear-surface text-bear"
              }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </>
  );
}
