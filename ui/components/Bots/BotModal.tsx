"use client";

import { useEffect, useRef } from "react";
import { useTradingStore } from "@/store/tradingStore";
import BotEquityCurve from "./BotEquityCurve";
import type { BotFill } from "@/types/ws";

const BOT_CONFIGS = [
  { userId: "market_maker", label: "Market Maker", color: "#6366f1" },
  { userId: "alpha_bot", label: "Alpha Bot", color: "#f59e0b" },
] as const;

function formatTs(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

type FillRowProps = { fill: BotFill };
function FillRow({ fill }: FillRowProps) {
  return (
    <div className="grid grid-cols-4 gap-1 font-mono text-micro py-0.5">
      <span className="text-text-muted">{formatTs(fill.ts)}</span>
      <span className={fill.side === "buy" ? "text-bull" : "text-bear"}>
        {fill.side.toUpperCase()}
      </span>
      <span className="text-text-primary text-right">{fill.price.toFixed(4)}</span>
      <span className="text-text-muted text-right">{fill.size.toFixed(2)}</span>
    </div>
  );
}

type BotColumnProps = {
  config: (typeof BOT_CONFIGS)[number];
};

function BotColumn({ config }: BotColumnProps) {
  const portfolio = useTradingStore((state) => state.botPortfolios.get(config.userId));
  const fills = portfolio?.recent_fills ?? [];
  const rpnl = portfolio?.realized_pnl ?? null;
  const upnl = portfolio?.unrealized_pnl ?? null;
  const equity = portfolio?.equity ?? null;
  const fillCount = portfolio?.fill_count ?? null;

  return (
    <div className="flex-1 min-w-0 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: config.color }}
        />
        <span className="font-mono text-label uppercase tracking-widest text-text-primary">
          {config.label}
        </span>
      </div>

      <BotEquityCurve userId={config.userId} color={config.color} />

      <div className="grid grid-cols-2 gap-1.5 font-mono text-micro">
        {[
          { label: "Equity", value: equity !== null ? `$${equity.toFixed(2)}` : "—" },
          { label: "Fills", value: fillCount ?? "—" },
          {
            label: "Realized",
            value: rpnl !== null ? `${rpnl >= 0 ? "+" : ""}${rpnl.toFixed(2)}` : "—",
            pnl: rpnl,
          },
          {
            label: "Unrealized",
            value: upnl !== null ? `${upnl >= 0 ? "+" : ""}${upnl.toFixed(2)}` : "—",
            pnl: upnl,
          },
        ].map(({ label, value, pnl }) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-xs border border-border/70 bg-bg-row px-2 py-1"
          >
            <span className="text-text-muted">{label}</span>
            <span
              className={
                pnl === undefined
                  ? "text-text-primary"
                  : pnl === null
                    ? "text-text-muted"
                    : pnl >= 0
                      ? "text-bull"
                      : "text-bear"
              }
            >
              {String(value)}
            </span>
          </div>
        ))}
      </div>

      <div>
        <div className="grid grid-cols-4 gap-1 border-b border-border pb-1 font-mono text-micro text-text-muted">
          <span>Time</span>
          <span>Side</span>
          <span className="text-right">Price</span>
          <span className="text-right">Size</span>
        </div>
        {fills.length === 0 ? (
          <p className="py-2 text-center font-mono text-micro text-text-muted">No fills yet</p>
        ) : (
          [...fills].reverse().map((f, i) => <FillRow key={i} fill={f} />)
        )}
      </div>
    </div>
  );
}

type BotModalProps = {
  onClose: () => void;
};

export default function BotModal({ onClose }: BotModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleOutside);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleOutside);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-bg-primary/60 backdrop-blur-sm animate-in fade-in duration-200" />
      <div
        ref={modalRef}
        className="modal-enter relative w-full max-w-2xl overflow-hidden rounded-xs border border-border bg-bg-panel shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border bg-bg-row px-4 py-3">
          <h2 className="text-heading uppercase tracking-[0.12em] text-text-primary">
            Trading Bots
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-bg-primary hover:text-text-primary"
            aria-label="Close bots panel"
          >
            ✕
          </button>
        </div>
        <div className="flex divide-x divide-border max-h-[calc(100dvh-120px)] overflow-y-auto scrollbar-hide">
          {BOT_CONFIGS.map((config) => (
            <BotColumn key={config.userId} config={config} />
          ))}
        </div>
      </div>
    </div>
  );
}
