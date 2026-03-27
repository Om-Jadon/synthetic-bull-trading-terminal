import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ToolRail from "@/components/ToolRail/ToolRail";

type StoreState = {
    activeTool: "none" | "line";
    setActiveTool: (tool: "none" | "line") => void;
    clearDrawings: () => void;
    chartFullscreen: boolean;
    toggleChartFullscreen: () => void;
};

const mockState: StoreState = {
    activeTool: "none",
    setActiveTool: vi.fn(),
    clearDrawings: vi.fn(),
    chartFullscreen: false,
    toggleChartFullscreen: vi.fn(),
};

vi.mock("@/store/tradingStore", () => ({
    useTradingStore: (selector: (state: StoreState) => unknown) => selector(mockState),
}));

describe("ToolRail", () => {
    it("renders mobile-accessible controls with 44px+ targets", () => {
        render(<ToolRail />);

        const drawButtons = screen.getAllByRole("button", {
            name: /draw horizontal line/i,
        });
        const clearButtons = screen.getAllByRole("button", {
            name: /clear all drawings/i,
        });

        expect(drawButtons.length).toBeGreaterThan(0);
        expect(clearButtons.length).toBeGreaterThan(0);

        for (const button of drawButtons) {
            expect(button.className).toContain("h-11");
            expect(button.className).toContain("w-11");
        }
    });
});
