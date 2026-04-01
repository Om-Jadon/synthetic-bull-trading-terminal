"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cancelOrder, placeOrder } from "@/lib/api";
import * as sounds from "@/lib/sound";
import { useTradingStore } from "@/store/tradingStore";
import type { BookMode } from "@/store/tradingStore";
import type { OrderRequest } from "@/types/ws";

const TIMEFRAME_MAP: Record<string, number> = {
  "1s": 1,
  "5s": 5,
  "15s": 15,
  "30s": 30,
  "1m": 60,
  "5m": 300,
};

// ─── Command definitions ────────────────────────────────────────────────────

type CommandDef = {
  syntax: string;
  description: string;
};

const COMMAND_DEFS: CommandDef[] = [
  { syntax: "buy <size>", description: "Market buy" },
  { syntax: "buy <size> at <price>", description: "Limit buy" },
  { syntax: "sell <size>", description: "Market sell" },
  { syntax: "sell <size> at <price>", description: "Limit sell" },
  { syntax: "cancel all", description: "Cancel all open orders" },
  { syntax: "cancel last", description: "Cancel most recent order" },
  {
    syntax: "timeframe <1s|5s|15s|30s|1m|5m>",
    description: "Switch chart timeframe",
  },
  {
    syntax: "layout <tab|stacked|large>",
    description: "Switch terminal layout",
  },
  { syntax: "help", description: "Show all commands" },
];

// ─── Parser ─────────────────────────────────────────────────────────────────

type ParsedOrder =
  | {
    kind: "order";
    side: "buy" | "sell";
    orderType: "market";
    size: number;
  }
  | {
    kind: "order";
    side: "buy" | "sell";
    orderType: "limit";
    size: number;
    price: number;
  };

type ParsedCommand =
  | ParsedOrder
  | { kind: "cancel_all" }
  | { kind: "cancel_last" }
  | { kind: "timeframe"; value: string }
  | { kind: "layout"; value: "tab" | "stacked" | "large" }
  | { kind: "help" };

function parseCommand(raw: string): ParsedCommand | null {
  const s = raw.trim();
  if (!s) return null;

  // buy/sell <size> at <price>
  const limitMatch = s.match(
    /^(buy|sell)\s+(\d+(?:\.\d+)?)\s+at\s+(\d+(?:\.\d+)?)$/i,
  );
  if (limitMatch) {
    return {
      kind: "order",
      side: limitMatch[1].toLowerCase() as "buy" | "sell",
      orderType: "limit",
      size: parseFloat(limitMatch[2]),
      price: parseFloat(limitMatch[3]),
    };
  }

  // buy/sell <size>
  const marketMatch = s.match(/^(buy|sell)\s+(\d+(?:\.\d+)?)$/i);
  if (marketMatch) {
    return {
      kind: "order",
      side: marketMatch[1].toLowerCase() as "buy" | "sell",
      orderType: "market",
      size: parseFloat(marketMatch[2]),
    };
  }

  if (/^cancel\s+all$/i.test(s)) return { kind: "cancel_all" };
  if (/^cancel\s+last$/i.test(s)) return { kind: "cancel_last" };

  const tfMatch = s.match(/^timeframe\s+(1s|5s|15s|30s|1m|5m)$/i);
  if (tfMatch) return { kind: "timeframe", value: tfMatch[1].toLowerCase() };

  const layoutMatch = s.match(/^layout\s+(tab|stacked|large)$/i);
  if (layoutMatch) return { kind: "layout", value: layoutMatch[1].toLowerCase() as BookMode };

  if (/^help$/i.test(s)) return { kind: "help" };

  return null;
}

function filterSuggestions(query: string): CommandDef[] {
  if (!query.trim()) return COMMAND_DEFS;
  const firstWord = query.trim().toLowerCase().split(/\s+/)[0];
  return COMMAND_DEFS.filter((c) =>
    c.syntax.toLowerCase().startsWith(firstWord),
  );
}

// Text to fill input from a suggestion (up to first placeholder, with trailing space)
function syntaxBase(def: CommandDef): string {
  return def.syntax.split("<")[0];
}

// ─── Component ───────────────────────────────────────────────────────────────

type Feedback = { ok: boolean; message: string };

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const trackOrderId = useTradingStore((s) => s.trackOrderId);
  const openOrders = useTradingStore((s) => s.openOrders);
  const orderHistory = useTradingStore((s) => s.orderHistory);
  const snapshotReady = useTradingStore((s) => s.snapshotReady);
  const bestAsk = useTradingStore((s) => (open ? s.asks[0]?.[0] : undefined));
  const bestBid = useTradingStore((s) => (open ? s.bids[0]?.[0] : undefined));

  const suggestions = filterSuggestions(query);
  const parsed = parseCommand(query);
  const effectiveSelectedIdx =
    suggestions.length === 0 ? 0 : Math.min(selectedIdx, suggestions.length - 1);

  // Clear any pending close timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // On open: save focus and focus input. On close: restore focus.
  useEffect(() => {
    if (!open) {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
      return;
    }

    previousFocusRef.current = document.activeElement as HTMLElement;

    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);

    requestAnimationFrame(() => inputRef.current?.focus());

    const trapFocus = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", trapFocus, true);

    return () => {
      document.removeEventListener("keydown", trapFocus, true);
    };
  }, [open]);

  // Scroll selected item into view on arrow navigation
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      '[aria-selected="true"]',
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [effectiveSelectedIdx]);

  const scheduleClose = useCallback(
    (delay: number) => {
      closeTimerRef.current = setTimeout(onClose, delay);
    },
    [onClose],
  );

  const execute = useCallback(async () => {
    if (!parsed || busy) return;

    // "help" just clears the query to reveal all suggestions
    if (parsed.kind === "help") {
      setQuery("");
      setSelectedIdx(0);
      return;
    }

    // Guard: market not ready
    if (parsed.kind === "order" && !snapshotReady) {
      setFeedback({ ok: false, message: "Market not connected" });
      return;
    }

    setBusy(true);
    setFeedback(null);

    try {
      if (parsed.kind === "cancel_all") {
        const orders = [...openOrders.values()];
        if (orders.length === 0) {
          setFeedback({ ok: false, message: "No open orders to cancel" });
          setBusy(false);
          return;
        }
        await Promise.all(orders.map((o) => cancelOrder(o.order_id)));
        const msg = `${orders.length} order${orders.length !== 1 ? "s" : ""} cancelled`;
        setFeedback({ ok: true, message: msg });
        useTradingStore.getState().addToast(msg, true);
        scheduleClose(1200);
        return;
      }

      if (parsed.kind === "timeframe") {
        useTradingStore
          .getState()
          .setChartTimeframe(TIMEFRAME_MAP[parsed.value]);
        const msg = `Timeframe → ${parsed.value}`;
        setFeedback({ ok: true, message: msg });
        useTradingStore.getState().addToast(msg, true);
        scheduleClose(800);
        return;
      }

      if (parsed.kind === "layout") {
        useTradingStore.getState().setBookMode(parsed.value);
        const msg = `Layout → ${parsed.value}`;
        setFeedback({ ok: true, message: msg });
        useTradingStore.getState().addToast(msg, true);
        scheduleClose(800);
        return;
      }

      if (parsed.kind === "cancel_last") {
        // orderHistory is newest-first; find first entry still in openOrders
        const lastOpen = orderHistory.find((o) => openOrders.has(o.order_id));
        if (!lastOpen) {
          setFeedback({ ok: false, message: "No open orders to cancel" });
          setBusy(false);
          return;
        }
        await cancelOrder(lastOpen.order_id);
        const msg = "Order cancelled";
        setFeedback({ ok: true, message: msg });
        useTradingStore.getState().addToast(msg, true);
        scheduleClose(1200);
        return;
      }

      // Buy / sell
      const payload: OrderRequest =
        parsed.orderType === "limit"
          ? {
            type: "limit",
            side: parsed.side,
            size: parsed.size,
            price: parsed.price,
          }
          : { type: "market", side: parsed.side, size: parsed.size };

      const resp = await placeOrder(payload);
      trackOrderId(resp.order_id);
      sounds.orderSubmit();

      const label =
        parsed.orderType === "limit"
          ? `${parsed.side.toUpperCase()} ${parsed.size} @ ${parsed.price}`
          : `${parsed.side.toUpperCase()} ${parsed.size} market`;

      const msg = `${label} · Order placed`;
      setFeedback({ ok: true, message: msg });
      useTradingStore.getState().addToast(msg, true);
      scheduleClose(1000);
    } catch (err) {
      setFeedback({
        ok: false,
        message: err instanceof Error ? err.message : "Order rejected",
      });
      setBusy(false);
    }
  }, [
    parsed,
    busy,
    snapshotReady,
    openOrders,
    orderHistory,
    trackOrderId,
    scheduleClose,
  ]);

  const fillSelected = useCallback(() => {
    const sug = suggestions[effectiveSelectedIdx];
    if (!sug) return;
    setQuery(syntaxBase(sug));
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }, [suggestions, effectiveSelectedIdx]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;

        case "ArrowDown":
          e.preventDefault();
          setSelectedIdx((i) => Math.min(i + 1, Math.max(0, suggestions.length - 1)));
          break;

        case "ArrowUp":
          e.preventDefault();
          setSelectedIdx((i) => Math.max(i - 1, 0));
          break;

        case "Tab":
          e.preventDefault();
          // Tab fills from suggestion only when no complete command is typed yet
          if (!parsed) fillSelected();
          break;

        case "Enter":
          e.preventDefault();
          if (parsed) {
            void execute();
          } else if (suggestions[effectiveSelectedIdx]) {
            // Fill the selected suggestion into the input
            setQuery(syntaxBase(suggestions[effectiveSelectedIdx]));
          }
          break;
      }
    },
    [onClose, suggestions, parsed, effectiveSelectedIdx, fillSelected, execute],
  );

  if (!open) return null;

  // Market fill price preview
  let fillPreview: string | null = null;
  if (parsed?.kind === "order" && parsed.orderType === "market") {
    const price = parsed.side === "buy" ? bestAsk : bestBid;
    if (price) fillPreview = `~$${price.toFixed(4)}`;
  }

  const showSuggestions = !feedback?.ok;

  return (
    <>
      {/* Backdrop — no blur, just dark tint */}
      <div
        className="fixed inset-0 z-50 bg-bg-primary/75"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Palette panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="command-palette-enter fixed left-1/2 top-12 z-50 w-120 max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-xs border border-border bg-bg-panel"
        style={{ boxShadow: "var(--shadow-overlay)" }}
      >
        {/* ── Input row ── */}
        <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
          {/* Search icon */}
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            className="shrink-0 text-text-muted"
            aria-hidden="true"
          >
            <circle
              cx="5.5"
              cy="5.5"
              r="4"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M9 9L11.5 11.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>

          <input
            ref={inputRef}
            id="command-palette-input"
            role="combobox"
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setFeedback(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="buy 2 · sell 1.5 at 100 · cancel all"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
            aria-haspopup="listbox"
            aria-controls="palette-list"
            aria-activedescendant={
              suggestions[effectiveSelectedIdx]
                ? `palette-item-${effectiveSelectedIdx}`
                : undefined
            }
            aria-label="Trading command input"
            className="min-w-0 flex-1 bg-transparent font-mono text-body text-text-primary placeholder:text-text-muted/50"
          />

          {busy && (
            <span className="shrink-0 animate-pulse font-mono text-micro uppercase tracking-[0.12em] text-text-muted">
              sending
            </span>
          )}

          <kbd className="shrink-0 rounded-xs border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-text-muted">
            esc
          </kbd>
        </div>

        {/* ── Feedback bar ── */}
        {feedback && (
          <div
            role="alert"
            className={`border-b border-border px-3 py-2 font-mono text-label ${feedback.ok ? "text-bull" : "text-bear"
              }`}
          >
            {feedback.message}
          </div>
        )}

        {/* ── Parse preview (valid command, no feedback yet) ── */}
        {parsed && !feedback && (
          <div className="flex items-center justify-between border-b border-border bg-bg-row px-3 py-1.5">
            <span className="font-mono text-[11px]">
              {parsed.kind === "order" ? (
                <>
                  <span
                    className={
                      parsed.side === "buy" ? "text-bull" : "text-bear"
                    }
                  >
                    {parsed.side.toUpperCase()}
                  </span>
                  <span className="text-text-muted">
                    {" "}
                    {parsed.size}
                    {parsed.orderType === "limit" && ` @ ${parsed.price}`}
                    {parsed.orderType === "market" && " market"}
                  </span>
                </>
              ) : parsed.kind === "cancel_all" ? (
                <span className="text-text-muted">Cancel all open orders</span>
              ) : parsed.kind === "cancel_last" ? (
                <span className="text-text-muted">
                  Cancel most recent open order
                </span>
              ) : parsed.kind === "timeframe" ? (
                <span className="text-text-muted">
                  Switch chart to{" "}
                  <span className="text-text-primary">{parsed.value}</span>
                </span>
              ) : parsed.kind === "layout" ? (
                <span className="text-text-muted">
                  Switch layout to{" "}
                  <span className="text-text-primary">{parsed.value}</span>
                </span>
              ) : (
                <span className="text-text-muted">Show all commands</span>
              )}
            </span>

            <span className="flex items-center gap-3 font-mono text-[11px] text-text-muted">
              {fillPreview && (
                <span>
                  est. <span className="text-text-primary">{fillPreview}</span>
                </span>
              )}
              <span>
                <kbd className="rounded-xs border border-border px-1 text-[9px]">
                  ↵
                </kbd>{" "}
                execute
              </span>
            </span>
          </div>
        )}

        {/* ── Suggestions list ── */}
        {showSuggestions && (
          <ul
            id="palette-list"
            ref={listRef}
            role="listbox"
            aria-label="Commands"
            className="panel-scroller max-h-54 overflow-y-auto"
          >
            {suggestions.length > 0 ? (
              suggestions.map((cmd, i) => (
                <li
                  key={cmd.syntax}
                  id={`palette-item-${i}`}
                  role="option"
                  aria-selected={i === effectiveSelectedIdx}
                  onClick={() => {
                    // "help" has no args — treat click as execute
                    const p = parseCommand(cmd.syntax);
                    if (p?.kind === "help") {
                      setQuery("");
                      setSelectedIdx(0);
                    } else {
                      setQuery(syntaxBase(cmd));
                      setSelectedIdx(0);
                    }
                    inputRef.current?.focus();
                  }}
                  className={`flex cursor-pointer select-none items-center justify-between px-3 py-2 transition-colors duration-75 ${i === effectiveSelectedIdx
                    ? "border-l-2 border-bull bg-neutral-hover"
                    : "border-l-2 border-transparent hover:bg-hover-overlay"
                    }`}
                >
                  <span className="font-mono text-[12px] text-text-primary">
                    {cmd.syntax}
                  </span>
                  <span className="font-sans text-[11px] text-text-muted">
                    {cmd.description}
                  </span>
                </li>
              ))
            ) : (
              <li className="px-3 py-3 font-mono text-[12px] text-text-muted">
                No matching command — try{" "}
                <span className="text-text-primary">buy</span>,{" "}
                <span className="text-text-primary">sell</span>, or{" "}
                <span className="text-text-primary">cancel</span>
              </li>
            )}
          </ul>
        )}

        {/* ── Footer keyboard hints ── */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 font-mono text-micro text-text-muted">
            <span>
              <kbd className="rounded-xs border border-border px-1 text-[9px]">
                ↑↓
              </kbd>{" "}
              navigate
            </span>
            <span>
              <kbd className="rounded-xs border border-border px-1 text-[9px]">
                tab
              </kbd>{" "}
              fill
            </span>
            <span>
              <kbd className="rounded-xs border border-border px-1 text-[9px]">
                ↵
              </kbd>{" "}
              execute
            </span>
          </div>
        )}
      </div>
    </>
  );
}
