"use client";

import { useRef } from "react";
import { useTradingStore } from "@/store/tradingStore";
import type { PortfolioMsg } from "@/types/ws";

const BOT_CONFIGS = [
  { userId: "market_maker", label: "Market Maker", color: "#6366f1" },
  { userId: "alpha_bot", label: "Alpha Bot", color: "#f59e0b" },
] as const;

type BotCardProps = {
  config: (typeof BOT_CONFIGS)[number];
  portfolio: PortfolioMsg | undefined;
  onExpand: () => void;
  isLast: boolean;
};

function BotCard({ config, portfolio, isLast }: BotCardProps) {
  const prevEquityRef = useRef<number | null>(null);
  const equity = portfolio?.equity ?? null;

  let flashClass = "";
  if (equity !== null && prevEquityRef.current !== null) {
    if (equity > prevEquityRef.current) flashClass = "flash-up";
    else if (equity < prevEquityRef.current) flashClass = "flash-down";
  }
  if (equity !== null) prevEquityRef.current = equity;

  const rpnl = portfolio?.realized_pnl ?? null;
  const upnl = portfolio?.unrealized_pnl ?? null;
  const fills = portfolio?.fill_count ?? null;

  return (
    <div
      className="flex-1 min-w-0 p-2 space-y-1.5"
      style={{ borderRight: !isLast ? "1px solid var(--color-border)" : undefined }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: config.color }}
        />
        <span className="font-mono text-micro uppercase tracking-widest text-text-muted">
          {config.label}
        </span>
      </div>
      <div className={`ticker-flash font-mono text-data text-text-primary ${flashClass}`}>
        {equity !== null ? `$${equity.toFixed(2)}` : "—"}
      </div>
      <div className="grid grid-cols-2 gap-x-2 font-mono text-micro">
        <span className="text-text-muted">Real</span>
        <span className={rpnl === null ? "text-text-muted" : rpnl >= 0 ? "text-bull" : "text-bear"}>
          {rpnl !== null ? `${rpnl >= 0 ? "+" : ""}${rpnl.toFixed(2)}` : "—"}
        </span>
        <span className="text-text-muted">Unreal</span>
        <span className={upnl === null ? "text-text-muted" : upnl >= 0 ? "text-bull" : "text-bear"}>
          {upnl !== null ? `${upnl >= 0 ? "+" : ""}${upnl.toFixed(2)}` : "—"}
        </span>
        <span className="text-text-muted">Fills</span>
        <span className="text-text-primary">{fills ?? "—"}</span>
      </div>
    </div>
  );
}

type BotDropdownProps = {
  onClose: () => void;
  onExpand: () => void;
};

export default function BotDropdown({ onClose, onExpand }: BotDropdownProps) {
  const botPortfolios = useTradingStore((state) => state.botPortfolios);

  return (
    <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-xs border border-border bg-bg-panel shadow-2xl">
      <div className="flex divide-x divide-border">
        {BOT_CONFIGS.map((config, i) => (
          <BotCard
            key={config.userId}
            config={config}
            portfolio={botPortfolios.get(config.userId)}
            onExpand={onExpand}
            isLast={i === BOT_CONFIGS.length - 1}
          />
        ))}
      </div>
      <div className="border-t border-border">
        <button
          type="button"
          onClick={() => { onClose(); onExpand(); }}
          className="w-full py-1.5 text-center font-mono text-micro uppercase tracking-widest text-text-muted transition-colors hover:bg-bg-row hover:text-text-primary"
        >
          Expand ↗
        </button>
      </div>
    </div>
  );
}
