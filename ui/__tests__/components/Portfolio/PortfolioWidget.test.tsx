import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PortfolioWidget from "@/components/Portfolio/PortfolioWidget";

const basePortfolio = {
    cash: 100000,
    holdings: 0,
    avg_entry: 0,
    unrealized_pnl: 0,
    realized_pnl: 0,
    equity: 100000,
    ts: 0,
    type: "portfolio" as const,
};

vi.mock("@/store/tradingStore", () => ({
    useTradingStore: (selector: (s: unknown) => unknown) =>
        selector({
            portfolio: basePortfolio,
            snapshotReady: true,
        }),
}));

describe("PortfolioWidget P&L color", () => {
    it("shows zero P&L in muted color, not green", () => {
        render(<PortfolioWidget />);
        // Both pnl spans should show "0.00" without a "+" prefix
        const spans = screen.getAllByText("0.00");
        for (const span of spans) {
            expect(span).not.toHaveClass("text-bull");
            expect(span).toHaveClass("text-text-muted");
        }
    });

    it("does not prefix zero with +", () => {
        render(<PortfolioWidget />);
        expect(screen.queryByText("+0.00")).not.toBeInTheDocument();
        expect(screen.getAllByText("0.00")).toHaveLength(2);
    });
});
