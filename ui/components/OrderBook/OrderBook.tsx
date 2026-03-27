"use client";

import MarketPanel, { type BookMode } from "@/components/MarketPanel/MarketPanel";

type OrderBookProps = {
    mode: BookMode;
    onModeChange: (mode: BookMode) => void;
};

export type { BookMode };

export default function OrderBook(props: OrderBookProps) {
    return <MarketPanel {...props} />;
}
