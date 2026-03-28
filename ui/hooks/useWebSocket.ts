"use client";

import { useEffect, useMemo, useRef } from "react";

import { createCandleAggregator } from "@/lib/candleAggregator";
import * as sounds from "@/lib/sound";
import { useTradingStore } from "@/store/tradingStore";
import type { SnapshotMsg, StatsMsg, WSMessage } from "@/types/ws";

type UseWebSocketOptions = {
  priceRef: React.RefObject<HTMLSpanElement | null>;
  priceFlashRef: React.RefObject<HTMLDivElement | null>;
  directionRef: React.RefObject<HTMLSpanElement | null>;
};

function isWSMessage(value: unknown): value is WSMessage {
  return typeof value === "object" && value !== null && "type" in value;
}

function syncTickerDom(
  stats: StatsMsg,
  previousPriceRef: React.RefObject<number>,
  priceRef: React.RefObject<HTMLSpanElement | null>,
  priceFlashRef: React.RefObject<HTMLDivElement | null>,
  directionRef: React.RefObject<HTMLSpanElement | null>,
): void {
  const nextPrice = stats.last_price;
  const prevPrice = previousPriceRef.current;
  previousPriceRef.current = nextPrice;

  if (priceRef.current) {
    priceRef.current.textContent = nextPrice.toFixed(4);
  }

  if (prevPrice !== 0 && prevPrice !== nextPrice) {
    const isUp = nextPrice > prevPrice;
    if (directionRef.current) {
      directionRef.current.textContent = isUp ? "▲" : "▼";
      directionRef.current.className = isUp ? "text-bull" : "text-bear";
    }
    if (priceFlashRef.current) {
      const flashClass = isUp ? "flash-up" : "flash-down";
      priceFlashRef.current.classList.remove("flash-up", "flash-down");
      window.requestAnimationFrame(() => {
        priceFlashRef.current?.classList.add(flashClass);
      });
    }
  }
}

function seedFromSnapshot(snapshot: SnapshotMsg): void {
  const store = useTradingStore.getState();
  store.setBidAsks(snapshot.book.bids, snapshot.book.asks);
  store.setCandles(snapshot.candles ?? []);
  store.setPortfolio(snapshot.portfolio);
  store.setSnapshotReady(true);
}

export function useWebSocket({
  priceRef,
  priceFlashRef,
  directionRef,
}: UseWebSocketOptions): void {
  const frameRef = useRef<number | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const queueRef = useRef<WSMessage[]>([]);
  const previousPriceRef = useRef(0);
  const lastBookFlushAt = useRef(0);
  const aggregator = useMemo(() => createCandleAggregator(), []);

  // ── WS telemetry — all refs, zero re-renders on the hot path ──
  // msgTimestampsRef: sliding-window of arrival timestamps for msgs/sec
  const msgTimestampsRef = useRef<number[]>([]);
  // arrivalRef: arrival time of the first msg in the current rAF batch (reset after flush)
  const arrivalRef = useRef<number>(0);
  // latencyRef: last computed flush latency in ms (written by rAF, read by setInterval)
  const latencyRef = useRef<number>(0);
  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080/ws";
    let socket: WebSocket | null = null;
    let cancelled = false;

    const scheduleFlush = () => {
      if (frameRef.current !== null) return;

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;

        // Latency = gap between first msg arrival in this batch and the rAF callback
        const now = Date.now();
        if (arrivalRef.current > 0) {
          latencyRef.current = now - arrivalRef.current;
          arrivalRef.current = 0;
        }

        const drained = queueRef.current.splice(0, queueRef.current.length);
        const store = useTradingStore.getState();

        // Collapse all book frames — only the last one matters visually
        const lastBook = [...drained].reverse().find((m) => m.type === "book");

        for (const message of drained) {
          switch (message.type) {
            case "snapshot": {
              seedFromSnapshot(message);
              aggregator.seed(message.candles ?? []);
              break;
            }
            case "book":
              // Handled below after the loop — skip inline
              break;
            case "trade":
              store.addTrade(message);
              store.upsertCandle(aggregator.onTrade(message));
              sounds.tick(message.size);
              break;
            case "stats":
              store.setStats(message);
              syncTickerDom(message, previousPriceRef, priceRef, priceFlashRef, directionRef);
              break;
            case "portfolio":
              store.setPortfolio(message);
              break;
            case "order_update": {
              const isHuman = store.knownOrderIds.has(message.order_id);
              store.onOrderUpdate(message);
              if (isHuman) {
                if (message.status === "filled") sounds.orderFill();
                else if (message.status === "cancelled") sounds.orderCancel();
                // "partial" status intentionally plays no sound to avoid audio spam on highly fragmented fills
              }
              break;
            }
          }
        }

        // Throttle book writes to at most 1 per 120ms (~8fps for the book)
        if (lastBook && lastBook.type === "book") {
          const timeSinceLast = now - lastBookFlushAt.current;
          if (timeSinceLast >= 120) {
            store.setBidAsks(lastBook.bids, lastBook.asks);
            lastBookFlushAt.current = now;
          }
        }
      });
    };

    // Throttled stats reporter — once per second, reads from refs
    statsTimerRef.current = setInterval(() => {
      const now = Date.now();
      msgTimestampsRef.current = msgTimestampsRef.current.filter(
        (t) => now - t < 1000,
      );
      useTradingStore.getState().setWsStats({
        msgsPerSec: msgTimestampsRef.current.length,
        latencyMs: Math.round(latencyRef.current),
      });
    }, 1000);

    const connect = () => {
      if (cancelled) return;

      useTradingStore.getState().setConnectionStatus("connecting");
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        useTradingStore.getState().setConnectionStatus("open");
      };

      socket.onmessage = (event) => {
        try {
          const parsed: unknown = JSON.parse(event.data);
          if (!isWSMessage(parsed)) return;

          const now = Date.now();
          msgTimestampsRef.current.push(now);
          // Only record the first arrival time per rAF batch
          if (arrivalRef.current === 0) arrivalRef.current = now;
          queueRef.current.push(parsed);
          scheduleFlush();
        } catch {
          // ignore malformed frames
        }
      };

      socket.onclose = () => {
        const store = useTradingStore.getState();
        store.setConnectionStatus("closed");
        store.setSnapshotReady(false);
        store.setWsStats({ msgsPerSec: 0, latencyMs: 0 });
        if (!cancelled) {
          reconnectRef.current = window.setTimeout(connect, 1000);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current);
      if (statsTimerRef.current !== null) clearInterval(statsTimerRef.current);
      socket?.close();
    };
  }, [aggregator]); // priceRef, priceFlashRef, and directionRef are stable refs and don't need to be in deps
}
