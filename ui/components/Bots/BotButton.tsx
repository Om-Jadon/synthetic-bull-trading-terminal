"use client";

import { useState } from "react";
import { useTradingStore } from "@/store/tradingStore";
import BotDropdown from "./BotDropdown";
import BotModal from "./BotModal";

export default function BotButton() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const botPortfolios = useTradingStore((state) => state.botPortfolios);

  const bothActive =
    botPortfolios.has("market_maker") && botPortfolios.has("alpha_bot");

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setDropdownOpen((v) => !v)}
          aria-label="Toggle bots panel"
          className="relative btn-tactile inline-flex h-7 items-center gap-1.5 rounded-xs border border-border bg-bg-row px-2 text-micro font-mono uppercase tracking-widest text-text-muted transition-colors hover:text-text-primary after:absolute after:-inset-3"
        >
          {bothActive && (
            <span className="status-dot inline-block h-1.5 w-1.5 rounded-full bg-bull" />
          )}
          Bots
        </button>
        {dropdownOpen && (
          <BotDropdown
            onClose={() => setDropdownOpen(false)}
            onExpand={() => {
              setDropdownOpen(false);
              setModalOpen(true);
            }}
          />
        )}
      </div>
      {modalOpen && <BotModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
