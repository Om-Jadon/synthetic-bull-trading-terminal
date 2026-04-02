import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import OrderRow from "@/components/OrderBook/OrderRow";

const mockSet = vi.fn();

vi.mock("@/store/tradingStore", () => ({
    useTradingStore: (selector: (s: unknown) => unknown) =>
        selector({ setPendingPriceFill: mockSet }),
}));

beforeEach(() => mockSet.mockClear());

describe("OrderRow", () => {
    it("renders price and sizes", () => {
        render(
            <OrderRow price={100.5} size={10.25} totalSize={50} side="bid" depthPct={0.6} />,
        );

        expect(screen.getByText("100.50")).toBeInTheDocument();
        expect(screen.getByText("10.25")).toBeInTheDocument();
        expect(screen.getByText("50.00")).toBeInTheDocument();
    });
});

describe("OrderRow keyboard accessibility", () => {
    it("has role=button and tabIndex=0 when liquid", () => {
        render(<OrderRow price={100.5} size={10} totalSize={50} side="bid" depthPct={0.6} />);
        const row = screen.getByRole("button");
        expect(row).toHaveAttribute("tabindex", "0");
    });

    it("has tabIndex=-1 when size is 0 (no liquidity)", () => {
        render(<OrderRow price={100.5} size={0} totalSize={0} side="bid" depthPct={0} />);
        const row = screen.getByRole("button");
        expect(row).toHaveAttribute("tabindex", "-1");
    });

    it("Enter key triggers setPendingPriceFill for ask row", () => {
        render(<OrderRow price={100.5} size={10} totalSize={50} side="ask" depthPct={0.4} />);
        fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
        expect(mockSet).toHaveBeenCalledWith(100.5, "sell");
    });

    it("Space key triggers setPendingPriceFill for bid row", () => {
        render(<OrderRow price={99.0} size={5} totalSize={20} side="bid" depthPct={0.3} />);
        fireEvent.keyDown(screen.getByRole("button"), { key: " " });
        expect(mockSet).toHaveBeenCalledWith(99.0, "buy");
    });
});
