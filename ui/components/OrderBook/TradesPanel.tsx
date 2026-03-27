"use client";

import { useTradingStore } from "@/store/tradingStore";

import TradesTable from "./TradesTable";

export default function TradesPanel() {
    const trades = useTradingStore((state) => state.trades);

    return (
        <section className="panel flex h-full min-h-0 flex-col">
            <TradesTable trades={trades} />
        </section>
    );
}
