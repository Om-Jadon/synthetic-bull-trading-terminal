"use client";

import { useEffect, useMemo, useRef } from "react";

import { createCandleAggregator } from "@/hooks/useCandles";
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
  const aggregator = useMemo(() => createCandleAggregator(), []);

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080/ws";
    let socket: WebSocket | null = null;
    let cancelled = false;

    const scheduleFlush = () => {
      if (frameRef.current !== null) {
        return;
      }

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        const drained = queueRef.current.splice(0, queueRef.current.length);

        const store = useTradingStore.getState();
        for (const message of drained) {
          switch (message.type) {
            case "snapshot": {
              seedFromSnapshot(message);
              aggregator.seed(message.candles ?? []);
              break;
            }
            case "book":
              store.setBidAsks(message.bids, message.asks);
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
              // Check before updating — knownOrderIds identifies human orders
              const isHuman = store.knownOrderIds.has(message.order_id);
              store.onOrderUpdate(message);
              if (isHuman) {
                if (message.status === "filled") sounds.orderFill();
                else if (message.status === "cancelled") sounds.orderCancel();
              }
              break;
            }
          }
        }
      });
    };

    const connect = () => {
      if (cancelled) {
        return;
      }

      useTradingStore.getState().setConnectionStatus("connecting");
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        useTradingStore.getState().setConnectionStatus("open");
      };

      socket.onmessage = (event) => {
        try {
          const parsed: unknown = JSON.parse(event.data);
          if (!isWSMessage(parsed)) {
            return;
          }
          queueRef.current.push(parsed);
          scheduleFlush();
        } catch {
          return;
        }
      };

      socket.onclose = () => {
        const store = useTradingStore.getState();
        store.setConnectionStatus("closed");
        store.setSnapshotReady(false);
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
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (reconnectRef.current !== null) {
        window.clearTimeout(reconnectRef.current);
      }
      socket?.close();
    };
  }, [aggregator, directionRef, priceFlashRef, priceRef]);
}
