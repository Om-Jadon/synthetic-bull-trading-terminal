# OpenSoft Trading Terminal — Complete UI Code Audit

**Status:** Exhaustive verified pass — 2026-03-28
**Scope:** Every file in `ui/components`, `ui/lib`, `ui/hooks`, `ui/store`, `ui/app`, `ui/types`, `ui/__tests__`, `ui/globals.css`, `ui/next.config.ts`, `ui/vitest.config.ts`

---

## Section 1: Dead Files (Confirmed via grep evidence)

### [DONE] 1.1 `ui/components/OrderBook/TradeTape.tsx` — DELETE IT
- **Verified:** `grep -r "TradeTape"` returns zero imports in any component.
- **What it is:** A 19-line component that wraps `TradesTable` in a titled container. Does exactly what `TradesPanel` does but was never wired up.
- **Action:** Delete.

### [DONE] 1.2 `ui/components/OrderBook/OrderBook.tsx` — DELETE IT
- **Verified:** `grep -r "import.*OrderBook"` across all `.tsx`/`.ts` files returns zero matches. `TradingTerminal.tsx` imports `MarketPanel` directly.
- **What it is:** A 15-line passthrough that wraps `MarketPanel` with a type alias. Completely orphaned.
- **Complication:** `ui/__tests__/components/OrderBook/OrderBook.test.tsx` imports it — that test file must be updated to import `MarketPanel` directly when this is deleted.
- **Action:** Delete + update test import.

### [DONE] 1.3 `ui/components/ToolRail/` — EMPTY DIRECTORY + BROKEN TEST
- **Verified:** `ls ui/components/ToolRail/` returns empty. `grep -r "ToolRail"` across components returns zero results. The test at `ui/__tests__/components/ToolRail/ToolRail.test.tsx` imports `@/components/ToolRail/ToolRail` which does not exist.
- **Impact:** Running `vitest` will crash on this test with a module-not-found error.
- **Action:** Delete the empty directory and the broken test file, OR implement `ToolRail.tsx` to match the test.

---

## Section 2: Dead Feature Code (Confirmed)

### [DONE] 2.1 Drawing Tools — `CandlestickChart.tsx` + `tradingStore.ts` — REMOVE OR COMPLETE
- **Verified:**
  - `tradingStore.ts` defines `activeTool`, `drawings`, `setActiveTool`, `addDrawing`, `clearDrawings` — 5 actions/state fields and associated logic.
  - `CandlestickChart.tsx` contains a `chart.subscribeClick` handler, a `priceLinesRef` Map, and a `syncDrawings` `useEffect` (~50 lines) that responds to `store.drawings`.
  - `grep -r "setActiveTool\|addDrawing\|clearDrawings\|activeTool"` across all components returns results **only** in:
    - `tradingStore.ts` (definition)
    - `CandlestickChart.tsx` (reads `activeTool === "line"`)
    - `ToolRail.test.tsx` (tests a component that doesn't exist)
  - There is **zero UI** in the rendered app that calls `setActiveTool("line")`. The feature is completely unreachable.
- **Action:** Remove the drawing system from both files. It bloats the store and the chart component and silently wastes memory tracking refs for a feature users cannot see.

### [DONE] 2.2 `StatsMsg.session_open` field — UNUSED IN FRONTEND
- **Verified:** `types/ws.ts` defines `session_open: number` on `StatsMsg`. `grep -r "session_open"` across all components/hooks/store returns zero uses. The backend sends it, the type declares it, and nobody reads it.
- **Action:** Remove from the `StatsMsg` type definition.

### [DONE] 2.3 `OrderUpdateMsg.filled_size` field — UNUSED IN FRONTEND
- **Verified:** `types/ws.ts` declares `filled_size: number` on `OrderUpdateMsg`. `grep -r "filled_size"` across all components/hooks/store returns zero uses. The frontend only reads `remaining_size`, `price`, `side`, `order_id`, and `status`.
- **Action:** Remove from the `OrderUpdateMsg` type definition.

### [DONE] 2.4 `OrderUpdateMsg` status `"partial"` — UNHANDLED CASE
- **Verified:** `types/ws.ts` declares the status union as `"open" | "partial" | "filled" | "cancelled"`. In `tradingStore.ts` `onOrderUpdate`, only `"filled"` and `"cancelled"` are checked (to remove from `openOrders`). `"partial"` is treated identically to `"open"` (order stays in the map) — this is probably correct behavior but is not commented. In `useWebSocket.ts`, only `"filled"` and `"cancelled"` trigger sounds. `"partial"` is completely silent.
- **Action:** Either add a `sounds.orderPartialFill()` for partial fills, or document that `"partial"` is intentionally silent. Currently ambiguous.

---

## Section 3: Unnecessary Indirection and Redundancy

### [DONE] 3.1 `TradesPanel.tsx` — SHALLOW WRAPPER (16 lines)
- **Verified:** `TradesPanel` only fetches `trades` from the store and passes it to `<TradesTable trades={trades} />`. `TradesTable` already fetches `snapshotReady` from the store itself. There is no technical reason for the split.
- **Action:** Pull the `trades` store selector into `TradesTable.tsx` directly. Delete `TradesPanel.tsx`. Update `MarketPanel.tsx` to import `TradesTable`.

### [DONE] 3.2 VWAP Formula Duplicated in 3 Places
- **Verified:**
  - `TradingTerminal.tsx` L63: `const vwap = vwapDenominator > 0 ? vwapNumerator / vwapDenominator : null;`
  - `AssetBar.tsx` L39: same formula.
  - `TradingTerminal.tsx` fullscreen overlay L138: passes `vwap.toFixed(4)` computed from the same local derivation.
- **Action:** Add a computed `selectVwap` selector to `tradingStore.ts`. Both components read from it.

### [DONE] 3.3 Session Stats JSX Duplicated Between `AssetBar` and `TradingTerminal`
- **Verified:** The fullscreen overlay in `TradingTerminal.tsx` (L133–141) renders H/L/VWAP/Trades. `AssetBar.tsx` (L90–109) renders the same stats with the same `.toFixed(4)` formatting. The only difference is layout.
- **Action:** Extract a `<SessionStats />` component used in both places.

### [DONE] 3.4 `Workbench.tsx` subscribes to `chartFullscreen` for a logically dead guard
- **Verified:** `Workbench.tsx` L30 reads `chartFullscreen`, and L97 uses it to guard `<EquityCurve>`:
  ```
  {activeTab === "performance" && !chartFullscreen && (
  ```
  When `chartFullscreen` is true, `TradingTerminal.tsx` replaces the entire non-chart layout (the section containing `Workbench`) with a full-height chart div. `Workbench` itself is **not rendered at all** in fullscreen mode. The `!chartFullscreen` guard in `Workbench` can never be false because the component simply won't mount.
- **Action:** Remove the `chartFullscreen` subscription and the `!chartFullscreen` condition from `Workbench.tsx`.

### [DONE] 3.5 `BookMode` State Is Prop-Drilled Instead of Living in Store
- **Verified:** `mode` and `onModeChange` are held in `useState` in `TradingTerminal.tsx` and prop-drilled to `MarketPanel`. The computed layout widths (`bookColumnPct`) are derived from this local state. The `CommandPalette` has no way to change the layout mode despite layout mode being an app-level concern.
- **Action:** Move `bookMode` into `tradingStore`. This also allows the `CommandPalette` to expose a `layout tab/stacked/large` command.

---

## Section 4: Overly Complex Implementations

### [DONE] 4.1 `estimateMarketFill` inline in `OrderEntry.tsx`
- **Verified:** Lines 20–58 of `OrderEntry.tsx`. This is a 40-line pure function with zero side effects and no React dependencies. It receives `side`, `size`, `asks`, `bids`, and `lastPrice` and returns math. There is no reason it lives inside a 474-line component.
- **Action:** Move to `ui/lib/tradeUtils.ts`.

### [DONE] 4.2 Dual Toast Engines (Two Completely Different Implementations)
- **Verified:**
  - `OrderEntry.tsx`: Custom queue with `toastSeq`, `timerRefs` (`Map<number, timeout>`), `toasts` state array, and a `fixed bottom-4 right-4` portal rendering `div` elements.
  - `CommandPalette.tsx`: A `feedback` state object (`{ ok, message }`) that shows inline below the input and auto-closes via `scheduleClose(delay)`.
  - These cover the same "show a success/error message" use case with two completely different data structures, lifetimes, and rendering strategies.
- **Action:** Extract a shared `useToast` hook.

### [DONE] 4.3 `OrderBookPanel.tsx` Exit Animation System Is Overly Complex for Fixed-Height Rows
- **Verified:** `OrderBookPanel.tsx` maintains `renderAskRows`/`renderBidRows` state, `staleAskRef`/`staleBidRef` refs, and a `removeTimersRef` Map of timeouts to handle the 400ms `book-row-exit` animation when rows leave the book. Given that the book now always shows exactly 15 fixed rows and new data comes in every 120ms, price levels that leave the book are immediately replaced by others — the exit animation is effectively invisible in practice (the row disappears behind new data before the 400ms plays out).
- **Action:** Consider removing the exit animation system entirely, simplifying to a direct `useMemo` render without the `syncRows` diffing state. This would drastically simplify the component from ~130 lines of logic to ~20.

### [DONE] 4.4 `OrderRow.test.tsx` Tests with Wrong Expected Value
- **Verified:** The test at L12 expects:
  ```
  expect(screen.getByText("100.5000")).toBeInTheDocument();
  ```
  But `OrderRow.tsx` renders `{price.toFixed(2)}`, which for `100.5` produces `"100.50"`, not `"100.5000"`. This test is **asserting wrong output** and will either fail or pass erroneously depending on the test DOM state.
- **Action:** Fix the assertion to `"100.50"`.

### [DONE] 4.5 `useWebSocket.ts` Includes Stable Refs in Dependency Array
- **Verified:** Line 211: `}, [aggregator, directionRef, priceFlashRef, priceRef]);`
  `directionRef`, `priceFlashRef`, and `priceRef` are `React.RefObject` instances created with `useRef` — they are stable references that never change identity. Including them in deps is misleading.
- **Action:** Add a comment or suppress the ESLint rule to clarify these are stable refs and won't cause re-subscription.

---

## Section 5: Dead Code Inside Individual Files

### [DONE] 5.1 `SpreadRow.tsx` — Imports `useTradingStore` But Never Calls It
- **Verified:** `useTradingStore` is imported on L5 but `useTradingStore(...)` is never called anywhere in the file. `bestBid` and `bestAsk` are received as props.
- **Action:** Remove the unused import.

### [DONE] 5.2 `Workbench.tsx` — Imports `useRef` But Never Calls It
- **Verified:** `useRef` is in the import on L3, but `useRef(` never appears in the file body. The component has no ref.
- **Action:** Remove `useRef` from the React import.

### [DONE] 5.3 `TradingTerminal.tsx` — `CSSProperties` Imported But Never Used as the Named Type
- **Verified:** L3 imports `type CSSProperties` from `react`, but the actual cast in the file is `as React.CSSProperties` (the namespace form). The destructured named import is never referenced directly.
- **Action:** Remove `type CSSProperties` from the React import.

### [DONE] 5.4 `groupBook.ts` — Exports `snapPrice` and `BookTick` That Are Never Imported Anywhere
- **Verified:** `grep -r "snapPrice\|BookTick"` across all `.tsx`/`.ts` files returns results only in `groupBook.ts` itself (the definitions). Neither export is imported anywhere in the codebase.
- What they are: `snapPrice` is a helper that rounds prices to tick boundaries; `BookTick` is a type alias for the tick union. Both are used nowhere.
- **Action:** Remove both exports from `groupBook.ts`.

### [DONE] 5.5 `hooks/useCandles.ts` — Misleadingly Named File
- **Verified:** The file is named `useCandles.ts` (hook naming convention) but it exports only `createCandleAggregator` and the `CandleAggregator` type — it is **not a React hook**. It has no `use*` function, no React import, and no `"use client"` directive.
- **Impact:** Misleads developers expecting a React hook. The name is inconsistent with its actual nature as a plain factory utility.
- **Action:** Rename to `ui/lib/candleAggregator.ts` and move to `lib/` alongside other pure utilities.

---

## Section 6: Dead CSS in `globals.css`

### [DONE] 6.1 `@utility layout-cols-tablet` and `@utility layout-cols-desktop` — DEAD CSS
- **Verified:** Automated class-usage scan confirms zero references in any `.tsx`/`.ts` file. Also, `var(--book-col)` and `var(--order-col)` referenced inside `layout-cols-desktop` are never set anywhere.
- **Action:** Delete both `@utility` blocks from `globals.css`.

### [DONE] 6.2 `@keyframes fade-out` — DEFINED BUT NEVER USED
- **Verified:** Automated scan finds `@keyframes fade-out` defined in `globals.css` but the name `fade-out` appears in no `animation` property anywhere in the CSS file. The exit animations use `book-row-exit`, not `fade-out`.
- **Action:** Delete the `@keyframes fade-out` block.

### 6.3 `.panel-scroller` Scrollbar Styles — Still Active for TradesTable
- **Note:** `.panel-scroller` scrollbar CSS is intentional — it still applies to `TradesTable`. The order book now uses `scrollbar-hide` instead. This is fine as-is.

---

## Section 7: Test Issues

| Test File | Issue | Severity |
|---|---|---|
| `ToolRail.test.tsx` | Imports a component that doesn't exist — will crash vitest | **Critical** |
| `OrderRow.test.tsx` | Asserts `"100.5000"` but component renders `"100.50"` — wrong assertion | **High** |
| `OrderBook.test.tsx` | Will break when `OrderBook.tsx` is deleted | **Medium** |
| `tradingStore.test.ts` | No test for VWAP accumulation/reset behaviour | **Done** |
| `ws.test.ts` | Tests only construct plain objects, not actual type imports | **Done** |

---

## Summary Table (All Findings)

| # | File / Area | Issue Type | Priority |
|---|---|---|---|
| 1.1 | `TradeTape.tsx` | Dead file, zero imports | **Done** |
| 1.2 | `OrderBook.tsx` | Dead passthrough wrapper | **Done** |
| 1.3 | `ToolRail/` directory | Empty dir + broken test | **Done** |
| 2.1 | Drawing tools (chart + store) | Unreachable dead feature | **Done** |
| 2.2 | `StatsMsg.session_open` | Unused type field | **Done** |
| 2.3 | `OrderUpdateMsg.filled_size` | Unused type field | **Done** |
| 2.4 | `OrderUpdateMsg` "partial" status | Unhandled/undocumented | **Done** |
| 3.1 | `TradesPanel.tsx` | Redundant 16-line wrapper | **Done** |
| 3.2 | VWAP formula | Duplicated in 3 places | **Done** |
| 3.3 | Session stats JSX | Duplicated in 2 places | **Done** |
| 3.4 | `Workbench` chartFullscreen guard | Logically dead condition | **Done** |
| 3.5 | `BookMode` prop-drilling | Wrong place for state | **Done** |
| 4.1 | `estimateMarketFill` in OrderEntry | Pure util in wrong file | **Done** |
| 4.2 | Two toast implementations | Inconsistent UI pattern | **Done** |
| 4.3 | `OrderBookPanel` exit animation system | Overengineered for fixed rows | **Done** |
| 4.4 | `OrderRow.test.tsx` assertion | Tests wrong output value | **Done** |
| 4.5 | Ref objects in `useWebSocket` deps | Misleading but harmless | **Done** |
| 5.1 | `SpreadRow` unused `useTradingStore` import | Dead import | **Done** |
| 5.2 | `Workbench` unused `useRef` import | Dead import | **Done** |
| 5.3 | `TradingTerminal` unused `CSSProperties` named import | Dead import | **Done** |
| 5.4 | `groupBook.ts` exports `snapPrice` + `BookTick` | Dead exports, zero consumers | **Done** |
| 5.5 | `useCandles.ts` filename | Not a hook, wrong folder/name | **Done** |
| 6.1 | `layout-cols-*` CSS utilities | Dead CSS, never used | **Done** |
| 6.2 | `@keyframes fade-out` | Defined, never referenced in CSS | **Done** |
| T1 | `ToolRail.test.tsx` | Crashes vitest — broken | **Done** |
| T2 | `OrderRow.test.tsx` | Wrong expected text | **Done** |
| T3 | `OrderBook.test.tsx` | Will break on deletion | **Done** |
| T4 | `tradingStore.test.ts` | VWAP tests missing | **Done** |
| T5 | `ws.test.ts` | Strict type validation missing | **Done** |
