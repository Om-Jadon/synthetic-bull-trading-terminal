"use client";

import { useTradingStore } from "@/store/tradingStore";

import TradesTable from "./TradesTable";

export default function TradesPanel() {
    const trades = useTradingStore((state) => state.trades);

    return (
        <section className="panel grid h-full min-h-0 grid-rows-[auto_1fr]">
            <div className="panel-title">Trades</div>
            <div className="min-h-0">
                <TradesTable trades={trades} />
            </div>
        </section>
    );
}
