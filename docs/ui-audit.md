# OpenSoft Trading Terminal — UI Audit

This document contains a comprehensive audit of the `ui` directory, highlighting dead code, unused components, unnecessary indirection, and overly complex implementations that can be simplified.

## 1. Dead Code & Unused Components

* **`ui/components/OrderBook/TradeTape.tsx`**
  * **Status:** Completely dead.
  * **Issue:** This component is an exact duplicate of `TradesPanel` but wraps it in a titled container. It is never imported or rendered anywhere in the codebase.
* **`ui/components/OrderBook/OrderBook.tsx`**
  * **Status:** Completely dead.
  * **Issue:** This file merely exports a functional wrapper around `MarketPanel.tsx`. However, `TradingTerminal.tsx` already imports `MarketPanel` directly, meaning `OrderBook.tsx` is entirely orphaned.
* **Drawing Tools (`store/tradingStore.ts` & `Chart/CandlestickChart.tsx`)**
  * **Status:** Partial dead code / half-implemented feature.
  * **Issue:** The global store contains `activeTool`, `drawings`, `setActiveTool`, `addDrawing`, and `clearDrawings`. The `CandlestickChart.tsx` component includes complex logic to plot these drawings on the chart. However, there is zero UI exposed to the user to actually activate the drawing tool (no toolbar, no command palette integration). This is dead implementation logic bloating the chart component and store.

## 2. Unnecessary Indirection

* **`ui/components/OrderBook/TradesPanel.tsx` wrapping `TradesTable.tsx`**
  * **Issue:** `TradesPanel` is just a 16-line wrapper that fetches `trades` from the store and passes it to `TradesTable`. This indirection isn't strictly necessary. `TradesTable` could fetch the trades from the store directly, or `TradesPanel` could contain the table logic without needing a separate `TradesTable` file, reducing the file count.

## 3. Overly Complex Implementations

* **`ui/components/OrderEntry/OrderEntry.tsx` (474 lines)**
  * **Issue:** This is the most unnecessarily complex file in the frontend. It violates the single responsibility principle by doing too many things inline:
    1. **Inline Math:** The `estimateMarketFill` function (market order slippage calculator) is hardcoded at the top of the file, adding 40 lines of logic that should be moved to a pure utility file (e.g., `lib/tradeUtils.ts`).
    2. **Custom Toast Engine:** It manually builds a custom toast notification queue (`toastSeq`, `setTimeout`, `Toasts[]` state, portal rendering) within the order entry form instead of using a standard abstract toast provider. 
    3. **Keyboard Flashes:** It manages a complex timeout-based system for briefly highlighting buttons when keyboard shortcuts are pressed (`keyFlash`, `flashTimerRef`). 
  
## 4. Architecture Simplifications

* **`MarketPanel.tsx` Mode State**
  * **Issue:** The layout mode (`tab`, `stacked`, `large`) is maintained in local state inside `TradingTerminal` and drilled down via props to `MarketPanel`. Considering the user's preference for layouts should likely persist across sessions (or be accessible to the workbench), this mode should live in the global `tradingStore.ts` rather than being prop-drilled down through components. 

## Actionable Recommendations
- Delete `TradeTape.tsx`
- Delete `OrderBook.tsx`
- Remove drawing tool logic from `tradingStore.ts` and `CandlestickChart.tsx`.
- Extract `estimateMarketFill` from `OrderEntry.tsx` into `lib/api.ts` or `lib/utils.ts`.
- Merge `TradesPanel` into `TradesTable`.
