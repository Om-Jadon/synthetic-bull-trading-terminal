"use client";

import { useEffect, useRef } from "react";
import { useTradingStore } from "@/store/tradingStore";

const SHORTCUTS = [
  {
    category: "Trading",
    items: [
      { key: "B", desc: "Switch to BUY side" },
      { key: "S", desc: "Switch to SELL side" },
      { key: "M", desc: "Set Order to MARKET" },
      { key: "L", desc: "Set Order to LIMIT" },
      { key: "1-4", desc: "Select Quick Size" },
      { key: "Enter", desc: "Submit current order" },
      { key: "Shift + C", desc: "Cancel all open orders" },
    ],
  },
  {
    category: "Navigation",
    items: [
      { key: "← / →", desc: "Switch Panel Tabs" },
      { key: "F", desc: "Maximize active chart" },
      { key: "Esc", desc: "Exit Fullscreen / Clear Form" },
    ],
  },
  {
    category: "System",
    items: [
      { key: "⌘ + K", desc: "Open Command Palette" },
      { key: "?", desc: "Toggle this Help window" },
    ],
  },
];

export default function HelpModal() {
  const isHelpOpen = useTradingStore((state) => state.isHelpOpen);
  const setHelpOpen = useTradingStore((state) => state.setHelpOpen);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isHelpOpen) {
        setHelpOpen(false);
      }
    };
    window.addEventListener("keydown", handleDown);
    return () => window.removeEventListener("keydown", handleDown);
  }, [isHelpOpen, setHelpOpen]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setHelpOpen(false);
      }
    };
    if (isHelpOpen) {
      document.addEventListener("mousedown", handleOutside);
    }
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isHelpOpen, setHelpOpen]);

  if (!isHelpOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-bg-primary/60 backdrop-blur-sm animate-in fade-in duration-200" />
      
      {/* Modal Content */}
      <div 
        ref={modalRef}
        className="modal-enter relative w-full max-w-md overflow-hidden rounded-xs border border-border bg-bg-panel shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border bg-bg-row px-4 py-3">
          <h2 className="text-heading uppercase tracking-[0.12em] text-text-primary">
            Terminal Shortcuts
          </h2>
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            className="flex h-6 w-6 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-bg-primary hover:text-text-primary"
            aria-label="Close help"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[calc(100dvh-80px)] overflow-y-auto p-4 scrollbar-hide">
          <div className="space-y-6">
            {SHORTCUTS.map((section) => (
              <div key={section.category}>
                <h3 className="mb-3 font-mono text-micro uppercase tracking-wider text-brand">
                  {section.category}
                </h3>
                <div className="grid gap-2">
                  {section.items.map((item) => (
                    <div 
                      key={item.key} 
                      className="flex items-center justify-between rounded-xs border border-transparent bg-bg-row/40 px-3 py-2 transition-colors hover:border-border hover:bg-bg-row"
                    >
                      <span className="text-body text-text-muted">{item.desc}</span>
                      <kbd className="min-w-[40px] rounded-xs border border-border bg-bg-panel px-1.5 py-0.5 text-center font-mono text-[10px] text-text-primary shadow-xs">
                        {item.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border bg-bg-row/50 px-4 py-3 text-center">
          <p className="font-mono text-[10px] text-text-muted/60">
            SYNTHETIC-BULL Trading Terminal v0.1.0
          </p>
        </div>
      </div>
    </div>
  );
}
