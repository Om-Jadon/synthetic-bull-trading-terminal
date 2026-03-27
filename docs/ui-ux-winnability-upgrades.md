# UI/UX Winnability Upgrades (vs Hyperliquid)

<!-- markdownlint-disable MD029 MD036 -->

**Date:** 2026-03-27
**Goal:** Elevate perceived product maturity from polished prototype to production-grade trading terminal.

---

## Why It Still Feels Less Professional

1. Visual hierarchy is too flat. Chart, order book, and execution panel have similar visual weight.
2. Panel chrome is too heavy. Too many boxed boundaries and hard panel edges make the UI feel componentized.
3. Data density is lower than pro terminals. Fewer high-signal metrics in header and execution rail.
4. Execution panel lacks confidence context. Limited at-a-glance risk and fill quality details.
5. Micro-interactions are present but not meaningful enough. Motion exists, but less tied to state changes that traders care about.

---

## High-ROI Changes

### 1. Rebuild Header Into Two-Tier Market Bar

**Current state:** Single `h-10` (40px) row in `AssetBar.tsx`. Three zones: brand+price+change% | H/L/VWAP/Vol/Trades | mute+status. All stats are already present in the center zone.

**Validity:** Valid. The single-row layout compresses the market stats and makes the brand compete with data.

**Breaking risks:**

- Changing `h-10 shrink-0` to a taller header shifts the `flex-col` layout in `TradingTerminal.tsx`. Use `h-auto shrink-0` on the header element and let rows define height naturally.
- No other layout impact since the header is outside the main grid.

**Required co-changes:** None beyond `AssetBar.tsx`.

**Implementation:**

Tier 1 (primary row, ~40px): brand wordmark + pair label + live price pill + change%.
Tier 2 (secondary row, ~28px, `bg-bg-primary border-b border-border`): H / L / VWAP / Vol / Trades stats that currently live in the center zone. Connection status and mute button move to the right end of Tier 2.

The center zone of Tier 1 should be empty (breathing room). Brand stays left-anchored in Tier 1.

**Primary files**

- `ui/components/Header/AssetBar.tsx`

---

### 2. Reduce Panel Chrome and Improve Layout Rhythm

**Current state:** Every panel uses `.panel` (1px border everywhere, `#222630`). The three main sections (chart, order book, order entry) are separated by `gap-2.5`. The status strip below the chart and the tool rail are also full-bordered panels.

**Validity:** Valid. The uniform border weight gives everything equal visual importance.

**Breaking risks:** Low — pure CSS changes. No logic affected.

**Required co-changes:** None.

**Implementation:**

- **ToolRail** (`aside.terminal-panel`): Remove full border. Use `border-r border-border` only (right edge separates it from chart). Remove `panel` class, add `border-r border-border bg-bg-panel`.
- **Status strip** (bottom of chart section in `TradingTerminal.tsx`): Remove full border. Use `border-t border-border` only to separate from chart above.
- **Chart, OrderBook, OrderEntry panels**: Keep full border — these are primary data panels.
- **Within OrderEntry**: The gap between OrderEntry and OpenOrders is currently `gap-2` in the grid. Replace with `border-t border-border` separator and zero gap to make them read as one unified panel.
- Keep `gap-2.5` between the three main column sections.

**Primary files**

- `ui/app/globals.css`
- `ui/components/TradingTerminal.tsx`

---

### 3. Upgrade Order Book Readability and Pressure Signals

**Current state:** 15 levels rendered. Column headers at `h-6` with `text-[10px] uppercase`. Depth bars use `--color-bull-depth: #26a69a26` and `--color-bear-depth: #ef535026` (~15% alpha). Best bid and best ask have no special emphasis — they blend into the rest of the rows.

**Validity:** Valid on all three points.

**Breaking risks:**

- Adding a "best row" emphasis requires passing an `isBest` boolean prop to `OrderRow.tsx`. The `renderBidRows[0]` is the best bid; `renderAskRows[renderAskRows.length - 1]` is the best ask (since asks are reversed before render).
- Depth alpha increase is a CSS variable change — zero risk.

**Required co-changes:** `OrderRow.tsx` needs an `isBest?: boolean` prop and conditional styling.

**Implementation:**

- Tighten row spacing: reduce row height in `OrderRow.tsx` from current default to `h-[22px]` or equivalent so 15 levels fit in less vertical space and more depth is visible at a glance.
- Depth contrast: raise `--color-bull-depth` alpha from `26` to `40` (`#26a69a40`) and `--color-bear-depth` from `26` to `40` (`#ef535040`).
- Best bid/ask emphasis: In `OrderBook.tsx`, pass `isBest={true}` to `renderBidRows[0]` and `renderAskRows[renderAskRows.length - 1]`. In `OrderRow.tsx`, when `isBest === true`, render the price text at full `text-text-primary` weight with `font-semibold` and apply `font-medium` to the size. For inactive rows, keep existing muted treatment.

**Primary files**

- `ui/components/OrderBook/OrderBook.tsx`
- `ui/components/OrderBook/OrderRow.tsx`
- `ui/app/globals.css`

---

### 4. Turn Order Entry Into a Confidence Panel

**Current state:** Order type and side chips are `h-11` (44px). Price and size inputs are `h-10` (40px). Quick size buttons are `h-9` (36px). Submit button is `h-11`. The panel already shows: market fill estimate (avg price, slippage, levels, partial fill flag), equity %, notional value. These are implemented in `estimateMarketFill()`.

**Validity:** Valid for compactness. Partially done for risk context. Post-only/reduce-only are UX placeholders only.

**Breaking risks:**

- Height changes are Tailwind class swaps — no logic impact.
- Fee estimate requires a hardcoded fee rate constant. The backend `OrderRequest` type does not expose fee data, so this is a computed display value only.
- Post-only/reduce-only: The current `OrderRequest` type does not include these fields. Render as disabled toggle buttons with `opacity-50 cursor-not-allowed` and tooltip "Not supported in simulation". Do not wire them to any state.

**Required co-changes:** None for height changes. Fee constant is local to `OrderEntry.tsx`.

**Implementation:**

- Control heights: type chips `h-11 → h-8`, side chips `h-11 → h-8`, price input `h-10 → h-9`, size input `h-10 → h-9`, quick size buttons `h-9 → h-7`. Submit button stays `h-10` as the primary action.
- Fee estimate display: Add `const FEE_RATE = 0.001` (0.1% taker). Show `Fee ~$${(notional * FEE_RATE).toFixed(2)}` in the risk line alongside the existing notional and equity %.
- Post-only/Reduce-only: Add two `disabled` toggle buttons in a row below the side selector. Label them "Post Only" and "Reduce Only". `opacity-40 cursor-not-allowed`. Add `title="Not supported in simulation"`. No state wiring.
- The market fill estimate block already exists and is correct. No changes needed there.

**Primary files**

- `ui/components/OrderEntry/OrderEntry.tsx`

---

### 5. Improve Chart Professional Cues

**Current state:** Volume series uses `color + "88"` (53% alpha) per bar with directional coloring (bull color for up candles, bear color for down candles) — already implemented in both `setData` and `update` paths. Pane stretch is 3:1 (candles:volume). No watermark. No VWAP overlay line.

**Validity:** Valid for watermark and VWAP line. Volume directional coloring is already done. Volume opacity is already moderate.

**Breaking risks:**

- Watermark: purely additive `chart.applyOptions()` call in the mount effect. Zero risk.
- VWAP line: requires subscribing to `vwapNumerator` / `vwapDenominator` store values and calling `candleSeries.createPriceLine()`. The store already tracks these. No new infrastructure needed.
- Pane ratio: `setStretchFactor` is already called. Adjust numbers only.

**Required co-changes:** None.

**Implementation:**

- Watermark: In the mount `useEffect`, after `createChart()`, call:

  ```ts
  chart.applyOptions({
      watermark: {
          visible: true,
          text: "NEXTBULL",
          color: "rgba(200,151,42,0.06)",
          fontSize: 36,
          horzAlign: "center",
          vertAlign: "center",
      },
  });
  ```

- VWAP overlay: Subscribe to store in a separate `useEffect`. When `vwapNumerator` / `vwapDenominator` change, compute VWAP and call `candleSeries.createPriceLine({ price: vwap, color: "#8791a3", lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: "VWAP" })`. Track the line ref for cleanup.
- Pane ratio: Change from `setStretchFactor(3)` / `setStretchFactor(1)` to `setStretchFactor(4)` / `setStretchFactor(1)` to give candles more vertical breathing room.
- Volume opacity: Keep at `"88"` (53% alpha). Reducing further risks making volume invisible during live updates. The directional coloring already provides enough disambiguation.

**Primary files**

- `ui/components/Chart/CandlestickChart.tsx`

---

### 6. Add Trust Signals for Judges

**Current state:** `AssetBar.tsx` shows connection status (open/closed/connecting) with a color-coded dot. No latency, no message rate, no processing delay data is tracked anywhere.

**Validity:** Valid. These are high-value signals for judges evaluating production readiness.

**Breaking risks:** Requires changes to `useWebSocket.ts` to measure and expose timing data. Requires new store state or a React context to surface the metrics to `AssetBar.tsx`.

**Required co-changes:**

1. In `useWebSocket.ts`: record `Date.now()` when each message arrives (`onmessage`). Track a rolling message count over a 1s window. Expose `{ msgsPerSec: number, lastMsgMs: number }` via a new store slice or a ref passed back from the hook.
2. In `tradingStore.ts`: add `wsStats: { msgsPerSec: number; lastMsgMs: number }` slice with `setWsStats` action.
3. In `AssetBar.tsx`: read `wsStats` and display in Tier 2: `WS 14ms · 8/s` in `text-text-muted font-mono text-[10px]`.

**Implementation specifics:**

- Message rate: maintain a `msgTimestamps: number[]` array in the hook, push `Date.now()` on every message, filter to last 1000ms, expose `length` as rate. Throttle the store update to once per second to avoid setState in hot path.
- Processing delay: measure `Date.now() - msgTimestamp` after each dispatch batch. Expose rolling average.

**Primary files**

- `ui/hooks/useWebSocket.ts`
- `ui/store/tradingStore.ts`
- `ui/components/Header/AssetBar.tsx`

---

### 7. Tighten Typography Discipline

**Current state:** `panel-title` class is 13px, weight 500, sentence case — renders "Order Book", "Order Entry", "Candles". These are correct. Column headers (Price, Size, Total) use `uppercase tracking-[0.08em]` which is correct trading terminal convention. Mode buttons and chips use `uppercase` which is appropriate for compact control labels. The submit button uses `uppercase tracking-[0.08em]`.

**Validity:** Narrowly valid. The main issue is the `BULL/USDC` pair label in `AssetBar.tsx` which uses `tracking-[0.16em]` — excessively wide for a live data label. Everything else is intentional and should stay.

**Breaking risks:** None — class change only.

**Required co-changes:** None.

**Implementation:**

- In `AssetBar.tsx`, change the pair label from `tracking-[0.16em]` to `tracking-[0.06em]`. This one change eliminates the most visible case of over-tracking.
- All other uppercase and tracking usage is appropriate — do not change.

**Primary files**

- `ui/components/Header/AssetBar.tsx`

---

## Screenshot-Driven Parity Upgrades

### A. Order Book Mode Control via Kebab Menu

**Current state:** Three visible text buttons ("tab", "stacked", "large") rendered as the `modeButtons` const. Used in two places: the `bookPane` header (stacked/large modes) and the tab-mode header. Each uses `aria-pressed`.

**Validity:** Confirmed valid — Hyperliquid uses exactly this pattern (three-dot menu with Tab/Stacked/Large options).

**Breaking risks:**

- `modeButtons` is referenced in both the `bookPane` and the tab-mode header. Both usages need replacing.
- The `bookWidth` logic in `TradingTerminal.tsx` is driven by the `mode` prop — this is unaffected.
- Accessibility pattern changes: `aria-pressed` buttons → `role="menu"` + `role="menuitemradio"` with `aria-checked`.

**Required co-changes:** None outside `OrderBook.tsx`.

**Implementation:**

- Add `const [kebabOpen, setKebabOpen] = useState(false)` to `OrderBook`.
- Replace `modeButtons` with a single `⋮` icon button (`aria-label="Layout options"`, `aria-haspopup="menu"`, `aria-expanded={kebabOpen}`).
- On click, toggle `kebabOpen`. On outside click (use a `useEffect` with `document.addEventListener("mousedown")`), close it.
- Dropdown: `role="menu"`, positioned `absolute right-0 top-full mt-1 z-20`, `bg-bg-panel border border-border rounded-xs shadow-lg py-1 min-w-[100px]`. Three items: Tab / Stacked / Large as `role="menuitemradio"` with `aria-checked={mode === item}`. Active item shows a `✓` prefix.
- Keyboard: Escape closes. Arrow keys cycle items. Enter/Space selects and closes.
- The `⋮` button should be `h-6 w-6`, same visual weight as the mute button in `AssetBar`.

**Primary files**

- `ui/components/OrderBook/OrderBook.tsx`

---

### B. Large Mode: True Split Layout

**Current state:** Large mode grid is `grid-cols-[minmax(0,3fr)_minmax(0,2fr)]` (3:2 ratio, book wider than trades). Width in `TradingTerminal.tsx` is `lg:w-[clamp(400px,38vw,520px)]`.

**Validity:** Valid. Equal split matches Hyperliquid's large mode.

**Breaking risks:** None — grid proportion change only. Both panes (`bookPane` and `TradeTape`) are already independently scrollable.

**Implementation:**

- Change `grid-cols-[minmax(0,3fr)_minmax(0,2fr)]` to `grid-cols-2`.
- In `TradingTerminal.tsx`, change large-mode width from `lg:w-[clamp(400px,38vw,520px)]` to `lg:w-[clamp(480px,44vw,600px)]` to give the larger split more total footprint.

**Primary files**

- `ui/components/OrderBook/OrderBook.tsx`
- `ui/components/TradingTerminal.tsx`

---

### C. Bottom Tabbed Workbench Under Chart

**Current state:** `TradingTerminal.tsx` right column has `grid-rows-[minmax(0,1fr)_clamp(170px,22vh,250px)_100px]` containing: `OrderEntry | PortfolioWidget | EquityCurve`. `OpenOrders` is rendered inside `OrderEntry.tsx` at the bottom of its component tree (not extracted). The chart section has a status strip below it.

**Validity:** Valid direction. Significant restructuring required.

**Breaking risks (critical — read before implementing):**

1. **OpenOrders is not a standalone panel.** It is rendered inside `OrderEntry.tsx` as `<OpenOrders />` at the bottom. To move it to the workbench, it must be extracted from `OrderEntry` and rendered directly from `TradingTerminal`. Remove the `<OpenOrders />` line from `OrderEntry.tsx` before adding it to the workbench.

2. **EquityCurve must conditionally render.** Canvas elements with store subscriptions must not live in hidden tab panels. Use `{activeWorkbenchTab === "equity" && <EquityCurve />}` — not `hidden` prop — so the canvas unmounts when the tab is inactive.

3. **chartFullscreen interaction.** When `chartFullscreen` is true, the bottom workbench should collapse to tab labels only (no content). Use `{!chartFullscreen && activeWorkbenchTab === "equity" && <EquityCurve />}` pattern. Tab bar itself stays visible in fullscreen.

4. **Status strip integration.** The current status strip (`Cash | POS | P&L`) lives between the chart and the workbench in the grid. Merge it into the workbench tab bar as a fixed right-side stat cluster, or keep it as a separate 28px strip. Do not delete it.

5. **Chart vertical space.** Adding the workbench below the chart eats into chart height. The chart's `min-h-[clamp(300px,52vh,480px)]` applies to the chart section grid item. Change the chart section from `grid-rows-[1fr_auto]` to `grid-rows-[1fr_auto_200px]` (status strip + workbench), or set the workbench to a fixed `h-[200px]` so chart retains its minimum.

**Implementation:**

- Add `const [workbenchTab, setWorkbenchTab] = useState<"orders" | "portfolio" | "equity">("orders")` to `TradingTerminal`.
- Chart section becomes `grid-rows-[1fr_auto_auto]`: chart | status strip | workbench.
- Workbench: `h-[200px]` fixed, `border border-border bg-bg-panel`. Tab bar row: `h-8 flex gap-0 border-b border-border`. Content area: `min-h-0 flex-1 overflow-hidden`.
- Tab buttons: "Orders" | "Portfolio" | "Equity" — use `role="tab"` / `role="tabpanel"` pattern matching the existing `OrderBook` tab implementation.
- Right column becomes: `OrderEntry` only, `grid-rows-1`. Remove `PortfolioWidget` and `EquityCurve` from the right column entirely.

**Primary files**

- `ui/components/TradingTerminal.tsx`
- `ui/components/OrderEntry/OrderEntry.tsx`
- `ui/components/Portfolio/EquityCurve.tsx`
- `ui/app/globals.css`

---

### D. Tool Section — Removed

**Decision:** The ToolRail is being removed entirely (see item G). The `40px` aside column disappears from the layout. The fullscreen toggle moves into the chart panel header. The line drawing tool and clear drawings are dropped from the UI for now — the store slices (`activeTool`, `drawings`, `clearDrawings`) remain in place for future re-introduction.

**Breaking risks:** See item G for full details.

**Primary files**

- `ui/components/ToolRail/ToolRail.tsx` (delete)
- `ui/components/TradingTerminal.tsx` (remove import + render + grid column)

---

### E. Spread Bar Stability and Center Anchor

**Current state:** `SpreadRow.tsx` reads `pressureRef.current` (raw buy volume / total volume from last 50 trades) and calls `setDisplayPressure(pressureRef.current)` directly on a 1s interval. This means sudden burst trades immediately pin the bar to one side.

**Validity:** Valid. One-line fix.

**Breaking risks:** None.

**Implementation:**

Change the interval callback from:

```ts
setDisplayPressure(pressureRef.current);
```

to:

```ts
setDisplayPressure(prev =>
    Math.max(0.2, Math.min(0.8, 0.85 * prev + 0.15 * pressureRef.current))
);
```

This applies EMA smoothing (α=0.15, weight on new sample) and clamps the range to [0.2, 0.8] so the bar never fully pins to either side under short-term bursts.

**Primary files**

- `ui/components/OrderBook/SpreadRow.tsx`

---

### F. Candlestick Timeframe Controls: Visibility and Contrast

**Current state:** Timeframe buttons use `text-[9px]`, `px-1.5 py-0.5`, `gap-px`. Active state: `bg-bg-row text-text-primary` (background change, no border). Inactive: `text-text-muted`. Hit area is approximately 20–22px tall — below comfortable target.

**Validity:** Valid. 9px text is too small for at-a-glance reading.

**Breaking risks:** None — Tailwind class changes only.

**Implementation:**

- Font size: `text-[9px]` → `text-[10px]`
- Padding: `px-1.5 py-0.5` → `px-2 py-1`
- Gap: `gap-px` → `gap-0.5`
- Active state: add `border border-border` alongside existing `bg-bg-row text-text-primary` so the active button has a visible boundary
- Inactive state: keep `text-text-muted hover:text-text-primary`

These changes bring hit area to ~28px and make the active button clearly distinct from the label "Candles" that precedes it.

**Primary files**

- `ui/components/Chart/CandlestickChart.tsx`

---

## Design Calibration Rules

### 1. Darker, Deeper Color Palette

**Current state:** `globals.css` already implements the target palette:

- `--color-bg-primary: #0b0e11` ✅ matches target
- `--color-bg-panel: #11141a` ✅ matches target
- `--color-bg-row: #15181f` (doc target was `#0f1318` — current is slightly lighter, acceptable)
- `--color-border: #222630` — doc target is `#1a1f27` (current is slightly lighter)

**Validity:** Substantially already done. One remaining delta: border color.

**Breaking risks:** Darkening `--color-border` further may reduce the visibility of the panel grid at first glance. Verify the border is still perceptible at `#1a1f27` on `#11141a` before shipping.

**LW Charts sync:** The chart theme reads CSS variables via `readColorVar()` at mount time. Chart-specific vars (`--color-chart-bg: #131722`, `--color-chart-grid: #1e222d`) are already separate from panel vars and already set darker. The chart is correctly themed independently — the LWC sync concern is already handled.

**Implementation:**

- Change `--color-border: #222630` to `--color-border: #1e2230` (a minor step toward target, while maintaining visibility).
- No chart changes needed.

**Primary files**

- `ui/app/globals.css`

---

### 2. Typographic Density and Restraint

**Current state:** Panel section titles ("Order Book", "Order Entry", "Candles", "Market View") are rendered in sentence case via the `panel-title` CSS class at 13px weight 500. Column headers (Price, Size, Total, BID, ASK) use `uppercase tracking-[0.08em]` — appropriate trading terminal convention, keep. Chip labels and submit button use `uppercase` — keep. The one outlier is the `BULL/USDC` pair label in `AssetBar.tsx` which uses `tracking-[0.16em]` — over-tracked for a live data label.

**Validity:** Narrowly valid. Most typography is already correct. Scope is a single property on a single element.

**Rule:** Panel section titles → sentence case ✅ already done. Data column labels (HIGH, LOW, VWAP, BID, ASK, Price, Size) → stay uppercase as column headers. Numeric streams → always `font-mono`. UI structural labels → `font-sans`.

**Implementation:**

- In `AssetBar.tsx`, change `tracking-[0.16em]` on the `BULL/USDC` span to `tracking-[0.06em]`.
- No other typography changes needed.

**Primary files**

- `ui/components/Header/AssetBar.tsx`

---

### 3. Compact UI Controls

**Current state:** Order type/side chips are `h-11` (44px). Price/size inputs are `h-10` (40px). Quick size buttons are `h-9`. Submit button is `h-11`. The right column allocates `minmax(0,1fr)` to `OrderEntry` which means with the current control heights the panel is spacious — compacting controls unlocks room for more risk context rows.

**Validity:** Valid. 44px chips are desktop-oversized for a dense trading panel.

**Breaking risks:** None — class changes. Submit button is intentionally exempt from the reduction (it is the primary action).

**Implementation:**

| Element                   | Current | Target                         |
| ------------------------- | ------- | ------------------------------ |
| Type chips (Market/Limit) | `h-11`  | `h-8`                          |
| Side chips (Buy/Sell)     | `h-11`  | `h-8`                          |
| Price input               | `h-10`  | `h-9`                          |
| Size input                | `h-10`  | `h-9`                          |
| Quick size buttons        | `h-9`   | `h-7`                          |
| Submit button             | `h-11`  | `h-11` (keep — primary action) |

**Primary files**

- `ui/components/OrderEntry/OrderEntry.tsx`

---

### 4. Chart Volume Subtlety

**Current state:** Volume bars use `color + "88"` (53% alpha) with directional coloring — bull color (`#26a69a88`) for up candles, bear color (`#ef535088`) for down candles. This is already implemented in both `setData` and `update` paths. The initial `addSeries` call uses `${bull}66` (40% alpha) as the default which is overridden by per-bar `color` on `setData`.

**Validity:** Partially valid. Volume is already directional ✅ and the opacity is moderate. It could be slightly more subdued.

**Breaking risks:** None.

**Implementation:**

- In `setData`, change `bull + "88"` / `bear + "88"` to `bull + "55"` / `bear + "55"` (33% alpha). This keeps volume bars readable without competing with price candle bodies.
- In `update`, change `lastColor + "88"` to `lastColor + "55"` to match.
- In `addSeries`, change the default `color: ${bull}66` to `${bull}55` for consistency.

**Primary files**

- `ui/components/Chart/CandlestickChart.tsx`

---

## G. Chart Header Redesign + Cinematic Fullscreen + Remove ToolRail

**Current state:**

- `CandlestickChart.tsx` panel header: "Candles" title left, timeframe buttons right (`text-[9px] gap-px`).
- Fullscreen is a grid-column trick in `TradingTerminal.tsx` — changes `grid-cols-[40px_1fr_auto_280px]` to `grid-cols-[40px_1fr]`. This hides the order book and order entry columns but keeps the header and tool rail visible. It is not true fullscreen.
- `ToolRail.tsx` is a `40px` `aside` column containing three buttons: line draw tool (`━`), clear drawings (`✕`), fullscreen toggle (`⛶`).
- Command palette toggle (`⌘K`) is global in `TradingTerminal.tsx` — no UI button exposes it.

**Validity:** Confirmed. The reference screenshot (Hyperliquid fullscreen) shows: chart occupies the entire viewport, thin top bar with OHLC + stats, exit fullscreen control. The current implementation does not achieve this.

**Breaking risks:**

- **ToolRail removal** — `TradingTerminal.tsx` grid must drop the `40px` column. Change `grid-cols-[40px_minmax(0,1fr)_auto_280px]` to `grid-cols-[minmax(0,1fr)_auto_280px]`. Remove `<ToolRail />` import and render. The `activeTool`, `drawings`, `clearDrawings`, `setActiveTool` store slices remain intact — the chart's click handler that checks `activeTool === "line"` becomes a no-op but does not break anything.
- **Chart remounts on fullscreen toggle.** The overlay renders a second `<CandlestickChart />` instance. LW Charts re-creates the chart from store data on mount — this is correct behavior, not a bug. All candle data is in the Zustand store. The non-fullscreen chart must not render while the overlay is active to avoid two simultaneous chart instances.
- **`chartFullscreen` store flag repurposed.** Currently drives grid-column logic. Will now drive overlay visibility. The `toggleChartFullscreen` action remains unchanged — only the consuming UI changes.
- **`paletteOpen` state.** Currently local to `TradingTerminal`. The fullscreen overlay needs to open the palette. Options: (a) lift `paletteOpen` into the store, or (b) pass `onPaletteOpen` callback as a prop to `CandlestickChart` or the overlay. Option (b) is simpler and avoids store pollution.

**Required co-changes:**

- `TradingTerminal.tsx`: remove ToolRail, change grid columns, add fullscreen overlay render, pass palette callback.
- `CandlestickChart.tsx`: move timeframes to left side of header, add palette icon button and fullscreen icon button to right side of header.
- `ToolRail.tsx`: can be deleted entirely or left as a dead file.

**Implementation:**

Chart panel header (always visible, inside normal chart panel):

- Left side: timeframe buttons (`1s 5s 15s 30s 1m 5m`) — upgraded per item F (10px, px-2 py-1, active border).
- Right side: two icon buttons, `h-6 w-6` matching the mute/status buttons in AssetBar:
  - Command palette: `⌘` or a search SVG icon. `aria-label="Command palette"`. `onClick={() => onPaletteOpen()}`.
  - Fullscreen: expand-corners SVG. `aria-label="Fullscreen chart"`. `onClick={toggleChartFullscreen}`.
- Remove the "Candles" text label — the timeframes make the panel's purpose self-evident.

Fullscreen overlay (rendered in `TradingTerminal.tsx` when `chartFullscreen === true`):

```tsx
{chartFullscreen && (
  <div className="fixed inset-0 z-50 flex flex-col bg-bg-primary">
    {/* Thin top bar */}
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-4 font-mono text-[11px]">
      <div className="flex items-center gap-4 text-text-muted">
        <span>H <span className="text-text-primary">{sessionHigh.toFixed(4)}</span></span>
        <span>L <span className="text-text-primary">{sessionLow.toFixed(4)}</span></span>
        <span>VWAP <span className="text-text-primary">{vwap?.toFixed(4) ?? "—"}</span></span>
        <span>Trades <span className="text-text-primary">{tradeCount.toLocaleString()}</span></span>
      </div>
      <div className="flex items-center gap-2">
        {/* palette button */}
        {/* exit fullscreen button */}
      </div>
    </div>
    {/* Chart fills remaining height */}
    <div className="min-h-0 flex-1">
      <CandlestickChart onPaletteOpen={() => setPaletteOpen(true)} />
    </div>
  </div>
)}
```

- The normal chart section conditionally renders: `{!chartFullscreen && <CandlestickChart ... />}`.
- The fullscreen top bar reads `sessionHigh`, `sessionLow`, `vwapNumerator/Denominator`, `tradeCount` directly from the store — all already available.
- Exit button: `onClick={toggleChartFullscreen}`. Also wire `Escape` key in a `useEffect` inside the overlay or in `TradingTerminal`.
- The fullscreen overlay's `CandlestickChart` receives the same `onPaletteOpen` prop. Its own header still shows the timeframe buttons (for switching timeframes while in fullscreen). The fullscreen icon in the chart header becomes an "exit" icon when `chartFullscreen === true`.

**Primary files**

- `ui/components/TradingTerminal.tsx`
- `ui/components/Chart/CandlestickChart.tsx`
- `ui/components/ToolRail/ToolRail.tsx` (delete)

---

## Suggested Execution Order (Highest Demo Impact)

Run calibration and visual-polish passes first — they are zero-risk and immediately improve perceived quality. Tackle structural changes after the baseline is sharp.

1. Remove ToolRail + chart header redesign + cinematic fullscreen overlay (G) — high visual impact, cleans up layout immediately.
2. Spread bar EMA stabilization (E) — one-line fix, high visible impact.
3. Timeframe control visibility upgrade (F) — already handled inside (G), verify sizing.
4. Compact control sizing pass (Calibration 3) — frees vertical space in OrderEntry.
5. Chart volume opacity pass (Calibration 4) — three number changes.
6. Typography tracking pass (Calibration 2 / High-ROI 7) — one class change.
7. Order book best bid/ask emphasis + depth contrast (High-ROI 3) — low risk, strong visual signal.
8. Darker border calibration (Calibration 1) — one CSS variable.
9. Chart professional cues: watermark + VWAP overlay (High-ROI 5).
10. Order entry fee estimate + post-only placeholders (High-ROI 4).
11. Order book large-mode equal split + width increase (B) — two-line change.
12. Order book kebab menu (A) — medium complexity, requires dropdown + keyboard handling.
13. Panel chrome reduction (High-ROI 2) — targeted border removals.
14. Bottom tabbed workbench (C) — largest structural change, do last.
15. Header two-tier redesign (High-ROI 1) — depends on workbench being done (stats move to Tier 2).
16. Trust diagnostics strip (High-ROI 6) — requires hook and store changes, do after layout stabilizes.

---

## Acceptance Criteria

1. First glance communicates primary market state in under 2 seconds.
2. Order entry panel explains execution risk without opening other panels.
3. Order book remains legible at high update rates and dense rows.
4. UI feels calmer and more premium despite higher information density.
5. Judges can identify at least three production-readiness cues (latency, connection quality, execution context).
6. Order Book mode switching is accessed through a kebab menu and remains keyboard accessible.
7. Large mode presents Order Book and Trades at equal visual weight.
8. Open Orders, Portfolio, and Equity views are available in a bottom tabbed workbench below the chart.
9. Spread pressure bar remains stable and centered under normal micro-fluctuations.
10. Timeframe controls are readable at a glance and clearly indicate active state.
11. Color palette is visibly deeper while preserving readability.
12. Execution controls are compact without reducing usability.
13. Volume bars are visually subordinate to candle price action.

---

## Notes

- Keep bull and bear colors reserved for market semantics.
- Keep brand accent restrained and away from trade-signal regions.
- Favor motion that explains state changes over decorative animation.
- Command palette (`⌘K`) is a differentiator — consider surfacing a subtle `⌘K` badge in the header so judges discover it without prompting.
