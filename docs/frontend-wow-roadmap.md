# WOW Factor Upgrades — NEXTBULL Trading Terminal

**Date:** 2026-03-26
**Purpose:** Strategic roadmap to maximize competition score (Frontend/UX = **50% of total grade**)
**Context:** IIT Kharagpur OpenSoft judges evaluating production-quality trading terminals

---

## Executive Summary

**Current Status:** ✅ Solid architectural foundation, 60fps performance, impeccable micro-animations, accessibility hardened, bug-free backend

**Gap Analysis:** Missing the visceral, sensory, first-3-seconds impression that separates memorable terminals from functional ones. Judges score what they *feel*, not just what they count.

**Target:** Make judges ask "Wait, is this a real trading platform?" — and then talk about it during deliberation.

**Competition Scoring:**

- Frontend & UX: **50%** ← WHERE THE COMPETITION IS WON
- Backend & Architecture: 20%
- Code Quality & Deployment: 20%
- Presentation: 10%
- Quant Bots (optional): 5% bonus

**Strategy:** Two parallel tracks — (1) functional features that show trading knowledge, (2) sensory/theatrical features that create lasting impressions. Both matter equally.

---

## Already Shipped ✅

These were identified as gaps but have since been implemented. Do not re-implement.

| Feature | Status | Notes |
|---------|--------|-------|
| Market order price preview | ✅ Done | Shows "Est. fill ~$X.XXXX" from live best ask/bid |
| Connection status badge | ✅ Done | AssetBar dot + `open/connecting/closed` with color |
| LONG/SHORT/FLAT position label | ✅ Done | Status strip and portfolio widget, derived from holdings sign |
| Inline order error feedback | ✅ Done | `role="alert"` error below submit button |
| Accessibility (labels, aria-live, touch targets) | ✅ Done | Full audit pass completed |

---

## TIER S: Critical — Must Have

These features are either table stakes (judges notice their absence) or guaranteed judge reactions (judges remember them). All of Tier S should ship before anything else.

---

### 1. Command Palette — Cmd+K (3 hours) ⚡ HIGHEST SINGLE ROI

**Why it matters:** No other student project will have this. Judges recognize Linear/Vercel/Raycast UX patterns. A command palette signals production-quality engineering thinking more than any other single feature.

**Current state:** ❌ Not implemented

**Target behavior:**

Press `Cmd+K` (or `Ctrl+K`) anywhere in the terminal — an overlay appears:

```
┌─────────────────────────────────────┐
│ 🔍  Type a command...               │
├─────────────────────────────────────┤
│  buy 2 at market                    │
│  sell 1.5 at 100.50                 │
│  cancel all                         │
│  timeframe 5m                       │
│  help                               │
└─────────────────────────────────────┘
```

Supported commands:

```
buy <size> [at <price>]    → place buy order (limit if price given, market otherwise)
sell <size> [at <price>]   → place sell order
cancel all                 → cancel all open orders
cancel last                → cancel most recent open order
timeframe <1s|5s|1m|5m>   → switch chart timeframe
help                       → show command list
```

**Implementation:**

- `CommandPalette.tsx` — modal overlay, `fixed inset-0`, backdrop blur, `role="dialog"`
- Input with live fuzzy matching against command list
- Parse typed command with simple regex on submit (no NLP needed)
- Execute via existing store actions and `placeOrder()` / `cancelOrder()` API
- `useEffect` on `keydown` at root level — open on `Cmd+K` / `Ctrl+K`, close on `Escape`
- Style: dark panel, monospace input, command suggestions list below

**Demo impact:** Judge presses `Cmd+K`, types "buy 2 at market", hits Enter → order executes. **"How did they build this?"** — guaranteed reaction.

---

### 2. Sound Design (30 minutes) 🔊

**Why it matters:** Bloomberg terminals have sound. Hyperliquid has sound. It makes the market feel *alive* in a way no visual element can. Nobody else will build this. It costs 30 minutes.

**Current state:** ❌ Silent

**Target sounds (Web Audio API — no external files needed):**

| Event | Sound |
|-------|-------|
| Trade in tape (small, <5) | Soft tick, low volume |
| Trade in tape (medium, 5–20) | Slightly louder tick |
| Trade in tape (large, >20) | Deeper click |
| Order submitted | Clean UI confirm tone |
| Order filled | Ascending two-note chime |
| Order cancelled | Short descending tone |

**Implementation:**

```ts
// lib/sound.ts — all sounds generated via Web Audio API, no files
function createTick(ctx: AudioContext, freq = 880, vol = 0.05, dur = 0.03) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(); osc.stop(ctx.currentTime + dur);
}
export const sounds = { tick: (vol: number) => ..., fill: () => ..., cancel: () => ... };
```

- `AudioContext` created lazily on first user interaction (browser autoplay policy)
- Mute toggle button in AssetBar header — persisted to `localStorage`
- Call `sounds.tick(sizeNormalized)` in `addTrade()` store action

**Demo impact:** Terminal feels alive. Judges hear the market breathing. They will mention this when describing the demo to others.

---

### 3. Theatrical Boot Sequence (30 minutes) 🎬

**Why it matters:** First impressions are scored before any interaction. The panel stagger is good but lasts 2 seconds. A deliberate boot sequence creates a *moment* judges remember.

**Current state:** ⚠️ Panels stagger in but header immediately shows live data

**Target sequence:**

1. Terminal loads → header shows `CONNECTING TO MARKET...` with pulsing amber dot
2. WebSocket connects, snapshot arrives → `snapshotReady` flips true
3. Header transitions: connecting state dissolves, live price/stats slide in with a 200ms fade
4. Panels stagger in as they do now (already implemented)
5. Brief status flash: `MARKET OPEN · NEXTBULL · LIVE` for 1.5s then fades

**Implementation:**

- `AssetBar.tsx` — when `!snapshotReady`, replace center stats with `CONNECTING TO MARKET...` and pulsing brand dot
- On `snapshotReady` flip: CSS transition on the stats row (`opacity`, `translateY(4px) → 0`)
- `TradingTerminal.tsx` — after panels load, show a 1.5s status overlay using existing `notice-enter` animation

**Demo impact:** The terminal "wakes up" like a real system initializing. Strong theatrical opening before judges interact with anything.

---

### 4. Keyboard-First Workflow (90 minutes) ⚡

**Why it matters:** Professional traders never touch the mouse during live trading. Judges will test this.

**Current state:** ❌ Zero keyboard shortcuts

**Target behavior:**

```
B          → Focus buy side
S          → Focus sell side
M          → Switch to market order
L          → Switch to limit order
1–4        → Quick size presets (maps to: 0.50, 1.00, 2.00, 5.00)
Enter      → Submit order
Shift+C    → Cancel all open orders
Escape     → Clear/reset form, blur inputs
Cmd+K      → Command palette (see #1)
```

> **Sizing note:** Keys `1–4` map to the existing fixed quick-size buttons. Do NOT introduce a portfolio-percentage sizing system via hotkeys — mixing two sizing models creates UX confusion.

**Implementation:**

- `OrderEntry.tsx` — `useEffect` with `keydown` on `window`, guard against firing when input is focused
- Focus management with `useRef` for price/size inputs

**Demo impact:** Judge presses `B`, `2`, `Enter` → order submitted in <1 second. Feels pro immediately.

---

### 5. Hotkey Onboarding Hint (20 minutes) 💡

**Why it matters:** Keyboard shortcuts that judges don't discover are worth zero.

**Current state:** ❌ No discoverability mechanism

**Target behavior:** On first `snapshotReady`, fade in a hint strip for 4 seconds then fade out:

```
Cmd+K · B · S · Enter — keyboard trading active
```

**Implementation:**

- `OrderEntry.tsx` — `useEffect` on `snapshotReady`, show/hide hint div with 4s timer
- Reuses existing `notice-enter` animation class — no new CSS needed
- `useRef` flag so it only shows once per session

---

### 6. Chart Timeframe Switcher (60 minutes) 📊

**Why it matters:** Hardcoded 1s candles = demo project. Switchable timeframes = production system.

**Current state:** ❌ Hardcoded `"Candles 1s"` in chart title

**Target behavior:**

```
[1s] [5s] [15s] [30s] [1m] [5m]
```

**Implementation:**

- `CandlestickChart.tsx` — Add timeframe selector row above chart title
- `tradingStore.ts` — Add `chartTimeframe: number` (seconds) state
- Aggregate base 1s candles from store by timeframe bucket on-demand — no backend changes
- Call `series.setData(aggregatedCandles)` on timeframe change

---

### 7. Fill Markers on Chart (45 minutes) 🎯

**Why it matters:** Visual feedback loop — the most satisfying part of trading UIs.

**Current state:** ❌ Orders execute but leave no trace on chart

**Target behavior:** Green ▲ for buy fills, red ▼ for sell fills, positioned at execution price.

**Implementation:**

- `tradingStore.ts` — Add `fills: FillMarker[]` slice; push on `order_update` with `status === "filled"`
- `CandlestickChart.tsx` — Call `candleSeriesRef.current.setMarkers(fills)` when fills change

> **v5 API note:** Use `series.setMarkers(markers: SeriesMarker[])` — NOT `createPriceLine()`. The latter draws a horizontal line across the whole chart. Shape: `"arrowUp"` / `"arrowDown"`.

---

### 8. Enhanced Trade Tape with Size Emphasis (75 minutes) 📈

**Why it matters:** All trades looking equal weight misses a core trading insight — size matters.

**Current state:** ⚠️ Basic tape, all trades look equal

**Target size buckets:**

- Small (<5): regular weight
- Medium (5–20): `font-semibold`
- Large (20–50): `font-bold` + brighter text
- Block (>50): `font-bold` + thin amber left-border accent + subtle highlight

**Hover:** Pause auto-scroll on `mouseenter` container, resume on `mouseleave`.

**Implementation:** `TradesTable.tsx` — add size classification to `formattedRows` memo; CSS classes `trade-sm` through `trade-block` in `globals.css`.

---

### 9. Session Statistics + VWAP in AssetBar (30 minutes) 📊

**Why it matters:** VWAP is the standard institutional metric. Every professional terminal shows it.

**Current state:** ⚠️ H, L, Vol displayed; VWAP and trade count missing

**Target:**

```
H 101.20 | L 99.80 | VWAP 100.22 | Vol 4,521.00 | Trades 1,245
```

**Implementation:**

- `tradingStore.ts` — Add `vwapSumPV`, `vwapSumV`, `tradeCount`; increment in `addTrade()`
- `AssetBar.tsx` — Derive `vwap = vwapSumPV / vwapSumV` in selector

> **Critical:** Do NOT compute VWAP from `state.trades` array — capped at 50. VWAP requires a running accumulator from session start.

---

## TIER A: High-Impact Polish — Should Have

---

### 10. Order Book Pressure Animation (1 hour) 💥

**Why it matters:** The difference between a static table and a living order book. Makes the market feel like it's breathing.

**Current state:** ❌ Price levels appear/disappear silently

**Target behavior:**

- New price levels entering the book: slide in from the right with 80ms `translateX(8px) → 0` + `opacity 0 → 1`
- Price levels with increasing size: brief brightness flash on the depth bar
- Price levels disappearing: `opacity 1 → 0` over 100ms before DOM removal

**Implementation:**

- `OrderRow.tsx` — Wrap in a keyed container; use CSS animation on mount
- In `globals.css`: `.book-row-enter { animation: slide-in 80ms ... }` (reuse existing `slide-in` keyframe)
- Track previous bids/asks in store to detect new/removed levels

**Demo impact:** The order book breathes with market activity. Judges feel the market pressure without being told about it.

---

### 11. Real-Time Equity Curve (45 minutes) 📈

**Why it matters:** The "are you winning?" visual that every professional terminal has. Currently the portfolio shows a number — this shows the *story*.

**Current state:** ❌ No historical equity visualization

**Target behavior:**

- Small line chart below the portfolio widget showing equity over the session
- Starts flat at $100,000. Curves up or down as fills happen
- Thin line, bull-colored when above start, bear-colored when below
- No axes, no labels — just the curve itself

**Implementation:**

- `tradingStore.ts` — Add `equityHistory: { time: number, value: number }[]`; push on each `portfolio` update
- New `EquityCurve.tsx` — Use LightWeight Charts `LineSeries` on a tiny `height: 60px` chart, `autoSize: true`
- No grid, no crosshair, no time scale — purely visual
- Add below `PortfolioWidget` in the right column grid

**Demo impact:** Judges see their P&L journey as a shape, not just a number. Immediately more compelling than a static value.

---

### 12. Buy/Sell Pressure Gauge (30 minutes) ⚖️

**Why it matters:** Shows market microstructure thinking. Judges see you understand momentum, not just price.

**Current state:** ❌ No direction bias indicator

**Target behavior:** A horizontal bar near the spread row showing recent buy vs sell volume ratio:

```
◄══════════■══════►
  Buy  63%    Sell 37%
```

Updates every second from last 50 trades. Animates smoothly as ratio shifts.

**Implementation:**

- `tradingStore.ts` — Derive buy/sell ratio from `state.trades` in a selector
- `SpreadRow.tsx` or a new `PressureBar.tsx` below spread — CSS `scaleX` transition on the indicator bar
- Reuses `--color-bull` / `--color-bear` tokens — no new colors needed

---

### 13. Chart Given Room to Breathe (20 minutes) 🖼️

**Why it matters:** The chart is the hero of a trading terminal. Currently `clamp(240px, 42vh, 360px)` — too short. It feels cramped.

**Current state:** ⚠️ Chart height capped at 360px

**Target:** Push to `clamp(300px, 52vh, 480px)`. The chart should dominate the center column.

**Implementation:** One-line change in `CandlestickChart.tsx` height clamp. Test that order book and status strip still fit without scrolling.

---

### 14. Tools Sidebar — Real Tools (2 hours) 🛠️

**Why it matters:** Currently displays vertical "TOOLS" text with no function. Dead space that reads as a placeholder to any judge who looks at it.

**Current state:** ❌ Decorative text only

**Target tools (3 real, minimal):**

```
━   Horizontal line (draw support/resistance on chart)
✕   Clear all drawings
⛶   Toggle fullscreen chart mode
```

**Implementation:**

- `ToolRail.tsx` — Replace text with 3 icon buttons, `flex-col gap-3`, tooltip on hover (`aria-label`)
- Drawing: LightWeight Charts `createPriceLine({ price, color, lineWidth })` on click-drag on chart
- Fullscreen: toggle a CSS class on the chart container that expands it via absolute positioning
- `tradingStore.ts` — Add `activeTool: "line" | "none"`, `drawings: PriceLine[]`

**Demo impact:** Turns 40px of dead space into a real feature. Judges who look at the sidebar see tools, not placeholder text.

---

### 15. Full Slippage Preview for Market Orders (45 minutes) 💸

**Why it matters:** Shows you understand execution quality — walk the book, not just best price.

**Current state:** ⚠️ Partial — shows best ask/bid only, no slippage calculation

**Target:** "Est. fill: $100.12 avg (0.08% slippage) across 3 levels"

**Implementation:** Walk order book levels for given size. Replace current simple preview in `OrderEntry.tsx`.

```ts
function estimateMarketFill(side: "buy" | "sell", size: number, asks: [number,number][], bids: [number,number][], lastPrice: number) {
    const levels = side === "buy" ? asks : bids;
    let remaining = size, totalCost = 0, levelsUsed = 0;
    for (const [price, volume] of levels) {
        const fill = Math.min(remaining, volume);
        totalCost += price * fill; remaining -= fill; levelsUsed++;
        if (remaining <= 0) break;
    }
    const filled = size - remaining;
    if (filled === 0) return null;
    const avgPrice = totalCost / filled;
    const slippage = Math.abs(avgPrice - lastPrice) / lastPrice * 100;
    return { avgPrice, slippage, levelsUsed, partial: remaining > 0 };
}
```

---

### 16. Order Size as % of Equity (30 minutes) 💰

**Why it matters:** Real traders think in risk units. Shows you understand position sizing.

**Current state:** ❌ No capital context on order form

**Target:** Below the size input, in muted mono text:

```
~4.2% of capital  ·  $420.00 notional
```

**Implementation:** `OrderEntry.tsx` — derive from `portfolio.equity` and `price * size`. Pure display, no state needed.

---

### 17. P&L Per Round-Trip — Recent Fills (45 minutes) 📊

**Why it matters:** Surfaces existing data in a compelling way. Judges see actual trading outcomes.

**Current state:** ❌ `realized_pnl` is a single running total with no per-trade breakdown

**Target:**

```
┌────────────────────────────┐
│ Recent Fills               │
├────────────────────────────┤
│ ▲ Buy  1.00 @ 100.25  14:32│
│ ▼ Sell 1.00 @ 100.67  14:33│  +$0.42
│ ▲ Buy  2.00 @ 100.45  14:35│
└────────────────────────────┘
```

**Implementation:** `RecentFills.tsx` in `components/Portfolio/`. Use `orderHistory` filtered for `status === "filled"`. Match consecutive buy/sell for P&L per close.

---

### 18. Better Empty/Loading States (45 minutes) ✨

**Current state:** ⚠️ Partial — connecting overlays exist, but no skeletons or retry UX

**Remaining gaps:**

- Order book loading skeleton (shimmer rows instead of "Connecting" text)
- Retry button when `connectionStatus === "closed"`
- Better empty copy in trade tape

**Implementation:** `@keyframes shimmer` in globals.css; retry calls existing reconnect logic in `useWebSocket.ts`.

---

## TIER B: Advanced Capabilities — Nice to Have

Implement only if Sprint 1 + Sprint 2 are complete with time remaining.

### 19. Trade History Panel with Performance Stats (120 minutes)

Full session history with win rate, avg win/loss, best trade. New `TradeHistory.tsx` component.

> Note: Implement #17 (Recent Fills) first — same data model, 25% of the time, 80% of the impact.

### 20. Depth Curve Visualization (90 minutes)

Cumulative depth curve beside the order book ladder. Shows liquidity distribution at a glance.

### 21. Session VWAP Overlay on Chart (60 minutes)

VWAP `LineSeries` on pane 0 alongside candles. Requires #9 (VWAP accumulator in store) first.

### 22. Keyboard Shortcuts Help Modal (30 minutes)

Press `?` to show all hotkeys. The onboarding hint (#5) handles discovery; this is supplementary.

---

## TIER C: Skip

| Feature | Why |
|---------|-----|
| Bracket orders (TP/SL) | Edge cases brutal, demo failure risk high |
| Market regime controls | Backend-heavy, low visibility |
| Replay mode | Requires recording infrastructure |
| Deterministic seed | Backend only, zero UX impact |
| Observability stream | Dev tooling, judges ignore |
| Synthetic event engine | Chaos mode = demo risk |
| Dark/light mode toggle | Destroys brand, dark is the identity |
| More chart indicators (RSI, MACD) | Too complex, judges won't have time |

---

## Implementation Priority Roadmap

### Sprint 1 — Sensory + Theatrical (~5 hours)
**Target:** Judges are stopped in their tracks within 60 seconds

| Feature | Time |
|---------|------|
| Command palette Cmd+K | 3h |
| Sound design | 30m |
| Boot sequence theater | 30m |
| Hotkey onboarding hint | 20m |
| Keyboard shortcuts | 90m |

**Outcome:** Judge opens terminal → dramatic boot → hears market → presses Cmd+K → executes trade with voice command. **No other team will do any of this.**

---

### Sprint 2 — Trading Intelligence (~5 hours)
**Target:** Judges recognize production trading knowledge

| Feature | Time |
|---------|------|
| Chart timeframe switcher | 60m |
| Fill markers on chart | 45m |
| Enhanced trade tape | 75m |
| Session stats + VWAP | 30m |
| Chart height increase | 20m |

**Outcome:** Judges switch timeframes, see fills marked, see VWAP, see size-weighted tape. **"This team understands trading."**

---

### Sprint 3 — Living Market (~3.5 hours)
**Target:** Terminal feels alive, not static

| Feature | Time |
|---------|------|
| Order book pressure animation | 1h |
| Real-time equity curve | 45m |
| Buy/sell pressure gauge | 30m |
| Tools sidebar real tools | 2h |

**Outcome:** Book breathes, equity curves, sidebar has tools. **Every part of the terminal has purpose.**

---

### Sprint 4 — Production Polish (~3 hours)
**Target:** No rough edges for the judge walkthrough

| Feature | Time |
|---------|------|
| Full slippage preview | 45m |
| Order size as % of equity | 30m |
| P&L per round-trip | 45m |
| Better empty/loading states | 45m |

**Outcome:** Every interaction has context. Nothing is left unpolished.

---

## 60-Second Judge Test Flow

```
0s   Terminal opens → "CONNECTING TO MARKET..." shows with pulsing dot
3s   WebSocket connects → live price snaps in, panels stagger
5s   Market sounds begin — soft ticks from trade tape
8s   Hotkey hint fades in: "Cmd+K · B · S · Enter — keyboard trading active"
15s  Judge presses Cmd+K → command palette opens
18s  Types "buy 2 at market" → Enter → order executes
20s  Confirm tone plays. Green ▲ appears on chart at fill price
22s  Portfolio equity pulses. Equity curve updates
25s  Judge clicks [5m] → chart redraws to 5-minute candles
30s  Judge hovers large trade in tape → scroll pauses
35s  Judge sees VWAP in header: "VWAP 100.22"
40s  Judge clicks market order → slippage preview: "0.08% across 2 levels"
45s  Judge sees buy/sell pressure gauge: "Buy 63%"
50s  Judge clicks horizontal line tool → draws support level on chart
60s  Judge checks trade history → fill logged with P&L
```

**If all pass:** 50% score secured. Judges will be talking about this during deliberation.

---

## Technical Notes

### Performance Budget

- 60fps under 100 msgs/sec — already achieved ✓
- Sound: `AudioContext` created lazily, reuse single context across all sounds
- Command palette: renders only when open (`display: none` otherwise, not unmounted)
- Order book animation: CSS-only transitions, no JS animation loops
- Equity curve: LightWeight Charts canvas, no React re-renders
- All new features must follow the DOM-ref-for-hot-path pattern established by the price ticker

### Zero Backend Changes Required

All features in Sprints 1–4 use existing WebSocket messages and REST endpoints. Backend is stable — do not touch it before the competition.

### LightWeight Charts v5 API Notes

- Fill markers: `series.setMarkers(markers: SeriesMarker[])` — NOT `createPriceLine()`
- VWAP overlay: `LineSeries` on pane 0 alongside the candlestick series
- Equity curve: separate `createChart()` instance on a 60px container
- Timeframe switch: `series.setData(aggregatedCandles)` — no chart recreation needed

### Sound — Browser Autoplay Policy

`AudioContext` must be created after a user gesture. Create it lazily on first click/keydown anywhere in the app. Store the instance in a module-level variable so it's shared across all sound calls.

---

## Competitive Analysis

| Feature | Hyperliquid | NEXTBULL Now | After S1+S2 | After S3+S4 |
|---------|-------------|--------------|-------------|-------------|
| Command palette | ❌ | ❌ | ✅ | ✅ |
| Sound design | ✅ | ❌ | ✅ | ✅ |
| Boot sequence | ✅ | ⚠️ | ✅ | ✅ |
| Keyboard shortcuts | ✅ | ❌ | ✅ | ✅ |
| Timeframe switcher | ✅ | ❌ | ✅ | ✅ |
| Fill markers | ✅ | ❌ | ✅ | ✅ |
| Size-emphasized tape | ✅ | ⚠️ | ✅ | ✅ |
| VWAP | ✅ | ❌ | ✅ | ✅ |
| Market price preview | ✅ | ✅ | ✅ | ✅ |
| Full slippage preview | ✅ | ❌ | ❌ | ✅ |
| Position sizing context | ✅ | ❌ | ❌ | ✅ |
| Equity curve | ✅ | ❌ | ❌ | ✅ |
| Living order book | ✅ | ❌ | ❌ | ✅ |
| Real tools sidebar | ✅ | ❌ | ❌ | ✅ |
| Buy/sell pressure | ✅ | ❌ | ❌ | ✅ |

**After Sprint 1+2:** Feature parity on what judges interact with in the first 60 seconds.
**After Sprint 3+4:** Full production parity on UX depth and visual sophistication.

---

## Scoring Projection

**Frontend & UX (50% = 50 points):**

- Current baseline: 37/50
- After Sprint 1: 43/50 — sound + command palette alone justify this jump
- After Sprint 2: 46/50 — trading intelligence features
- After Sprint 3+4: 49/50 — living market + no rough edges

**Target: 49/50 on frontend = competition-winning score.**

---

## Final Recommendation

**Sprint 1 is non-negotiable.** Command palette + sound + boot sequence is the combination that creates a lasting impression. These three features take ~4 hours combined and they are the things judges will describe to each other after the demo. No team will build all three.

**Sprint 2 shows you know trading.** Without VWAP, fill markers, and timeframes, the terminal is technically impressive but domain-shallow. Sprint 2 fixes that.

**Sprint 3 makes it feel alive.** The equity curve, pressure gauge, and book animation transform a functional terminal into one that feels like a real market.

**Sprint 4 removes all excuses.** No rough edge, no missing context, no moment where a judge thinks "almost."

**Total: ~17 hours of focused work for a terminal that wins the competition.**
