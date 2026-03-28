import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import OrderRow from "@/components/OrderBook/OrderRow";

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
