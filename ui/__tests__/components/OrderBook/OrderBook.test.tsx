import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import MarketPanel from "@/components/MarketPanel/MarketPanel";

type StoreState = {
    bids: [number, number][];
    asks: [number, number][];
    trades: Array<{
        id: string;
        side: "buy" | "sell";
        price: number;
        size: number;
        ts: number;
    }>;
    snapshotReady: boolean;
};

const mockState: StoreState = {
    bids: [
        [100.11, 5],
        [100.1, 7],
    ],
    asks: [
        [100.12, 4],
        [100.13, 3],
    ],
    trades: [
        { id: "t1", side: "buy", price: 100.12, size: 1.2, ts: Date.UTC(2026, 2, 26, 9, 1, 1) },
        { id: "t2", side: "sell", price: 100.11, size: 0.8, ts: Date.UTC(2026, 2, 26, 9, 1, 0) },
    ],
    snapshotReady: true,
};

vi.mock("@/store/tradingStore", () => ({
    useTradingStore: (selector: (state: StoreState) => unknown) => selector(mockState),
}));

describe("OrderBook view modes", () => {
    it("tab mode defaults to order book and can switch to trades", () => {
        render(<MarketPanel mode="tab" onModeChange={vi.fn()} />);

        const tabList = screen.getByRole("tablist", { name: /order book and trades view/i });
        const bookTab = within(tabList).getByRole("tab", { name: /order book/i });
        const tradesTab = within(tabList).getByRole("tab", { name: /trades/i });

        expect(bookTab).toHaveAttribute("aria-selected", "true");
        expect(tradesTab).toHaveAttribute("aria-selected", "false");

        expect(screen.getByRole("tabpanel", { name: /order book/i })).toBeVisible();
        expect(screen.queryByRole("tabpanel", { name: /trades/i })).not.toBeInTheDocument();

        fireEvent.click(tradesTab);

        expect(bookTab).toHaveAttribute("aria-selected", "false");
        expect(tradesTab).toHaveAttribute("aria-selected", "true");
        expect(screen.queryByRole("tabpanel", { name: /order book/i })).not.toBeInTheDocument();
        expect(screen.getByRole("tabpanel", { name: /trades/i })).toBeVisible();
        expect(screen.getByRole("columnheader", { name: /time/i })).toBeInTheDocument();
    });

    it("tab mode supports arrow navigation between tabs", () => {
        render(<MarketPanel mode="tab" onModeChange={vi.fn()} />);

        const orderBookTab = screen.getByRole("tab", { name: /order book/i });
        const tradesTab = screen.getByRole("tab", { name: /trades/i });

        fireEvent.keyDown(orderBookTab, { key: "ArrowRight" });
        expect(tradesTab).toHaveAttribute("aria-selected", "true");

        fireEvent.keyDown(tradesTab, { key: "ArrowLeft" });
        expect(orderBookTab).toHaveAttribute("aria-selected", "true");
    });

    it("stacked mode shows both order book and trades panels", () => {
        render(<MarketPanel mode="stacked" onModeChange={vi.fn()} />);

        expect(screen.queryByRole("tablist", { name: /order book and trades view/i })).not.toBeInTheDocument();
        expect(screen.getByText("Total")).toBeInTheDocument(); // from OrderBookPanel
        expect(screen.getByRole("columnheader", { name: /time/i })).toBeInTheDocument(); // from TradesPanel
        expect(screen.getAllByText("Price")).not.toHaveLength(0); // Appears in both
    });

    it("large mode keeps both panels and mode switch control works", () => {
        const onModeChange = vi.fn();
        render(<MarketPanel mode="large" onModeChange={onModeChange} />);

        expect(screen.getByText("Total")).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: /time/i })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /layout options/i }));
        fireEvent.click(screen.getByRole("menuitem", { name: /tab/i }));
        
        expect(onModeChange).toHaveBeenCalledWith("tab");
    });
});
