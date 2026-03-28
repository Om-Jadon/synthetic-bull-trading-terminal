"use client";

import { useTradingStore } from "@/store/tradingStore";

export default function ToastManager() {
  const toasts = useTradingStore((state) => state.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`notice-enter pointer-events-auto rounded-xs border px-4 py-2.5 font-mono text-[12px] shadow-lg transition-all ${
            toast.ok
              ? "border-bull/40 bg-bull-surface text-bull"
              : "border-bear/40 bg-bear-surface text-bear"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="opacity-70">{toast.ok ? "✓" : "!"}</span>
            {toast.message}
          </div>
        </div>
      ))}
    </div>
  );
}
