import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

import CommandPalette from "@/components/CommandPalette/CommandPalette";

type StoreState = {
    trackOrderId: (id: string) => void;
    openOrders: Map<string, { order_id: string }>;
    orderHistory: Array<{ order_id: string }>;
    snapshotReady: boolean;
    asks: [number, number][];
    bids: [number, number][];
};

const mockState: StoreState = {
    trackOrderId: vi.fn(),
    openOrders: new Map(),
    orderHistory: [],
    snapshotReady: true,
    asks: [[100.2, 1]],
    bids: [[100.1, 1]],
};

vi.mock("@/store/tradingStore", () => ({
    useTradingStore: (selector: (state: StoreState) => unknown) => selector(mockState),
}));

describe("CommandPalette", () => {
    it("exposes an explicit accessible name for command input", () => {
        render(<CommandPalette open onClose={vi.fn()} />);

        expect(
            screen.getByRole("combobox", { name: /trading command input/i }),
        ).toBeInTheDocument();
    });
});
