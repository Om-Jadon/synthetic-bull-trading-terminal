# NEXTBULL Phase 2 — Next.js Frontend Design Spec

**Date:** 2026-03-25
**Phase:** 2 — Next.js Trading Terminal
**Scoring weight:** 50% of total evaluation — this is where the competition is won
**Depends on:** Phase 1 Go backend (complete)

---

## 1. Objective

Build a Hyperliquid-quality trading terminal frontend that connects to the Phase 1 Go backend via WebSocket and REST. The terminal must render at 60fps under 100 messages/sec, feel like a real production trading desk, and impress judges on first open with a full impeccable micro-animation treatment.

---

## 2. Tech Stack

| Component | Version | Notes |
|-----------|---------|-------|
| Framework | Next.js 15.2.x | App Router, React 19 |
| Charts | TradingView Lightweight Charts v5.1.0 | v5 API: `chart.addSeries(CandlestickSeries, opts)` |
| State | Zustand v5.0.8 | External store — WebSocket updates outside React tree |
| Styling | Tailwind CSS v4.2.2 | CSS-first config, no `tailwind.config.js` |
| Language | TypeScript (strict) | |
| Fonts | Plus Jakarta Sans + JetBrains Mono | via `next/font/google` |

---

## 3. Project Structure

```
frontend/
├── app/
│   ├── layout.tsx              # Server Component: fonts, metadata, global CSS import
│   └── page.tsx                # dynamic(() => import TradingTerminal, { ssr: false })
├── components/
│   ├── TradingTerminal.tsx     # Top-level 3-column layout, panel sizing, staggered load-in
│   ├── Header/
│   │   └── AssetBar.tsx        # NEXTBULL wordmark (amber), BULL/USDC, price ticker, session stats
│   ├── Chart/
│   │   ├── CandlestickChart.tsx  # TradingView canvas, ref-controlled
│   │   └── useCandles.ts         # Candle aggregation hook from trade stream
│   ├── OrderBook/
│   │   ├── OrderBook.tsx         # Container with 3-mode switcher
│   │   ├── OrderRow.tsx          # Row with animated CSS depth bar
│   │   ├── SpreadRow.tsx         # Spread value + %, pulses on change
│   │   └── TradeTape.tsx         # Scrolling recent trades, slide-in row entrance
│   ├── OrderEntry/
│   │   └── OrderEntry.tsx        # Market/Limit tabs, Buy/Sell toggle, submit flow
│   └── Portfolio/
│       └── PortfolioWidget.tsx   # Equity, cash, holdings, P&L with flash animation
├── store/
│   └── tradingStore.ts           # Zustand slices: orderbook, trades, portfolio, orders, stats
├── hooks/
│   └── useWebSocket.ts           # RAF-batched WebSocket hook
├── lib/
│   └── api.ts                    # POST /orders, DELETE /orders/{id}
├── Dockerfile
└── next.config.ts
```

---

## 4. Layout

Exact Hyperliquid layout replicated for NEXTBULL:

```
┌─────────────────────────────────────────────────────────────────┐
│ NEXTBULL (amber)  BULL/USDC  $100.33▲  +1.33%  Vol: 4521.00    │  ← AssetBar (36px)
├────┬────────────────────────────────┬───────────┬───────────────┤
│    │                                │           │ Market│Limit  │
│    │   CandlestickChart             │ OrderBook │ Buy  │ Sell  │
│ (  │   (TradingView canvas)         │ +Trades   │               │
│ s  │   1s candles, live OHLCV       │ (3 modes) │ Price / Size  │
│ i  │                                │           │               │
│ d  ├────────────────────────────────┤           │ Place Order   │
│ e  │   Volume sub-pane              │           ├───────────────┤
│ b  │                                │           │ Equity        │
│ a  ├────────────────────────────────┴───────────┤ Cash / BULL   │
│ r  │  Cash: $X  │  BULL: X  │  P&L: +$X        │ P&L           │
└────┴────────────────────────────────────────────┴───────────────┘
```

**Column widths:**
- Left sidebar (tools): 40px fixed
- Center (chart): flex-grow
- OrderBook panel: 240px (Tab/Stacked mode) or 360px (Large mode; chart shrinks)
- Right (OrderEntry + Portfolio): 280px fixed

---

## 5. Color System & Typography

### Tailwind v4 CSS-first config (`app/globals.css`)

```css
@import "tailwindcss";

@theme {
  /* Backgrounds */
  --color-bg-primary: #0e1117;
  --color-bg-panel:   #1a1d29;
  --color-bg-row:     #131722;

  /* Trade signal colors — locked */
  --color-bull:  #26a69a;
  --color-bear:  #ef5350;

  /* Brand accent — amber, ONLY for NEXTBULL wordmark */
  --color-brand: oklch(75% 0.13 68);

  /* Text */
  --color-text-primary: #e0e0e0;
  --color-text-muted:   #6b7280;

  /* Borders & spread row */
  --color-border: #1e222d;
  --color-spread: #2a2d3e;
}

/* Flash overlay keyframes — applied via class swap on DOM refs */
@keyframes flash-up {
  0%   { background-color: transparent; }
  30%  { background-color: #26a69a22; }
  100% { background-color: transparent; }
}
@keyframes flash-down {
  0%   { background-color: transparent; }
  30%  { background-color: #ef535022; }
  100% { background-color: transparent; }
}
@keyframes pulse-scale {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.02); }
  100% { transform: scale(1); }
}
```

### Typography

```css
/* In layout.tsx — loaded via next/font/google */
--font-sans: 'Plus Jakarta Sans';   /* weights: 400, 500, 600 — UI labels, headings, buttons */
--font-mono: 'JetBrains Mono';      /* weights: 400, 500 — all prices, sizes, P&L numbers */
```

**Size conventions:**
- Order book rows: 11px mono
- Trade tape rows: 12px mono
- Price ticker (AssetBar): 20px mono, bold
- Order entry labels: 13px sans
- Portfolio numbers: 14px mono

---

## 6. WebSocket Message Contract

All messages from the backend, with exact TypeScript types:

```typescript
// book — every 100ms
type BookMsg = {
  type: 'book'
  bids: [number, number][]   // [price, size][], top 20
  asks: [number, number][]
  ts: number                 // Unix ms
}

// trade — immediate on match (all trades, not just human)
type TradeMsg = {
  type: 'trade'
  id: string
  price: number
  size: number
  side: 'buy' | 'sell'       // aggressor/taker side
  ts: number                 // Unix ms
}

// stats — every 1s
type StatsMsg = {
  type: 'stats'
  session_open: number
  session_high: number
  session_low: number
  last_price: number         // authoritative price source for ticker
  session_volume: number
  change_pct: number         // already a percentage, e.g. 1.33 (not 0.0133)
  ts: number                 // Unix ms
}

// portfolio — after human partial/filled fills only (NOT on cancel)
type PortfolioMsg = {
  type: 'portfolio'
  cash: number
  holdings: number
  avg_entry: number
  unrealized_pnl: number
  realized_pnl: number
  equity: number
  ts: number                 // Unix ms
}

// order_update — broadcast for ALL orders (human + GBM bots)
// Frontend filters by known order IDs stored in openOrders map
type OrderUpdateMsg = {
  type: 'order_update'
  order_id: string
  status: 'open' | 'partial' | 'filled' | 'cancelled'
  filled_size: number
  remaining_size: number
  price: number
  side: 'buy' | 'sell'
  ts: number                 // Unix ms
}

// snapshot — once on connect
type SnapshotMsg = {
  type: 'snapshot'
  book: { bids: [number, number][]; asks: [number, number][]; ts: number }
  candles: Candle[] | null   // last 300 1s candles — null on cold start (no trades yet)
  portfolio: PortfolioMsg    // includes type: 'portfolio' field (same as standalone broadcast)
  ts: number                 // Unix ms
}

// Candle — time is Unix SECONDS (TradingView requirement)
type Candle = {
  time: number    // Unix seconds — NEVER milliseconds
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// CRITICAL: ts fields = Unix ms | candle.time = Unix seconds — never mix
type WSMessage = BookMsg | TradeMsg | StatsMsg | PortfolioMsg | OrderUpdateMsg | SnapshotMsg
```

### HTTP API

```typescript
// POST /orders
type OrderRequest = {
  type: 'limit' | 'market'
  side: 'buy' | 'sell'
  price?: number             // required for limit, omit for market
  size: number
}
type OrderResponse = { order_id: string; status: 'accepted' }

// DELETE /orders/{id} → 204 No Content

// GET /candles?limit=300 → { candles: Candle[] }
// NOTE: Not needed on connect — snapshot WS message provides candles
```

---

## 7. State Management (Zustand v5)

External store — WebSocket handler calls `getState().update*()` outside React:

```typescript
// store/tradingStore.ts
interface TradingStore {
  // Order book
  bids: [number, number][]
  asks: [number, number][]
  setBidAsks: (bids: [number, number][], asks: [number, number][]) => void

  // Trades (last 50, newest first)
  trades: TradeMsg[]
  addTrade: (t: TradeMsg) => void

  // Session stats
  lastPrice: number
  changePct: number
  sessionHigh: number
  sessionLow: number
  sessionVolume: number
  setStats: (s: StatsMsg) => void

  // Portfolio
  portfolio: PortfolioMsg | null
  setPortfolio: (p: PortfolioMsg) => void

  // Human orders
  openOrders: Map<string, OrderUpdateMsg>
  orderHistory: OrderUpdateMsg[]
  onOrderUpdate: (u: OrderUpdateMsg) => void
}
```

Selector usage (avoids unnecessary re-renders):
```typescript
const bids = useTradingStore(s => s.bids)           // only OrderBook re-renders on book update
const portfolio = useTradingStore(s => s.portfolio)  // only Portfolio re-renders on portfolio update
```

---

## 8. RAF-Batched WebSocket Hook

```typescript
// hooks/useWebSocket.ts
// onmessage NEVER calls setState — writes to a useRef buffer
// RAF loop drains buffer at 60fps, calls setState once per frame
// Chart updates bypass React via seriesRef.current.update()
// Price ticker bypasses React via priceRef.current.textContent
```

**Flow:**
```
WS onmessage → bufferRef.current.push(msg)
                          ↓
         requestAnimationFrame (60Hz)
                          ↓
         drain buffer → process all messages:
           book   → store.setBidAsks()
           trade  → store.addTrade() + useCandles hook update
           stats  → store.setStats() + priceRef.current.textContent = last_price (DOM)
           portfolio → store.setPortfolio()
           order_update → store.onOrderUpdate() (filter by known IDs)
           snapshot → seed everything + trigger staggered panel load-in
                          ↓
         single React render per frame
```

**Connection URL:** `process.env.NEXT_PUBLIC_WS_URL` (e.g. `ws://localhost:8080/ws`)

---

## 9. Candlestick Chart

**Library:** TradingView Lightweight Charts v5.1.0

**v5 API (changed from v4):**
```typescript
const chart = createChart(containerRef.current, options)
const candleSeries = chart.addSeries(CandlestickSeries, {
  upColor: '#26a69a', downColor: '#ef5350',
  borderUpColor: '#26a69a', borderDownColor: '#ef5350',
  wickUpColor: '#26a69a', wickDownColor: '#ef5350',
})
const volumeSeries = chart.addSeries(HistogramSeries, { priceScaleId: 'volume' })
```

**Seeding:** `candleSeries.setData(snapshot.candles ?? [])` on connect — guard against `null` (backend returns null on cold start before any trades). Chart is never empty once the GBM generator has run for a second.

**Live updates:** Each `trade` message → `useCandles` hook aggregates current-second candle → `candleSeries.update(candle)`. Entirely via `seriesRef.current` — zero React re-renders.

**Candle boundary:** When `Math.floor(Date.now() / 1000)` changes, open a new candle.

**Volume:** Colored by candle direction — teal if `close >= open`, red if `close < open`.

**Controlled via refs only:** `chartRef`, `candleSeriesRef`, `volumeSeriesRef`. No state, no re-renders on tick.

---

## 10. Order Book

### Three View Modes (toggled by icons in panel header)

| Mode | Layout | OrderBook panel width |
|------|--------|-----------------------|
| Tab | OrderBook and TradeTape as tabs | 240px |
| Stacked | OrderBook top half, TradeTape bottom half | 240px |
| Large | OrderBook and TradeTape side by side | 360px, chart shrinks |

### Row Rendering

Each `OrderRow` displays: **Price** (teal for bids, red for asks) | **Size** | **Total** (cumulative)

**Animated depth bar:**

- Absolutely-positioned full-width background element behind each row
- Scale driven by CSS custom property: `rowEl.style.setProperty('--depth-pct', pct)`  (0–1 float)
- CSS: `transform: scaleX(var(--depth-pct)); transform-origin: left center; transition: transform 120ms ease-out;`
- GPU-composited: `scaleX` triggers no layout, runs on compositor thread
- Color: teal at 15% opacity for bids, red at 15% opacity for asks; intensity scales with cumulative depth

**Spread row** centered between asks and bids:
- Shows absolute spread + percentage: e.g. `0.016  0.04%`
- CSS class swap on spread change: 200ms `scale(1.04)` pulse via `transform` only

### Top-of-book: 15 ask rows + spread + 15 bid rows (30 levels total from top-20 book data)

---

## 11. Trade Tape

Scrolling list of recent trades (last 50), newest at top.

Each row: **Price** (teal/red by aggressor side) | **Size** | **Time** (HH:MM:SS)

**Row entrance animation:**
```css
@keyframes slide-in {
  from { transform: translateX(8px); opacity: 0; }
  to   { transform: translateX(0);   opacity: 1; }
}
.trade-row-enter { animation: slide-in 180ms ease-out; }
```
New rows get the class on mount; old rows push down naturally.

---

## 12. Price Ticker Flash (AssetBar)

Price ticker uses a DOM ref — zero React involvement:
```typescript
// In AssetBar, updated from useWebSocket RAF loop via stats.last_price
priceRef.current.textContent = lastPrice.toFixed(4)
directionRef.current.className = direction === 'up' ? 'flash-up' : 'flash-down'
// CSS @keyframes flash-up/flash-down: 400ms background-color pulse
```

Display: `BULL/USDC  $100.3291▲  +1.33%  H: 102.45  L: 99.10  Vol: 4521.00`

---

## 13. Order Entry Panel

**Tabs:** Market | Limit

**Toggle:** Buy (teal) | Sell (red)

**Inputs:**
- Price (Limit only) — pre-filled with `(bestBid + bestAsk) / 2` from store
- Size (BULL) — number input, min 0.01

**Available balance** shown above inputs (cash for buys, holdings for sells)

**Place Order button:**
- CSS ripple on click: `::after` pseudo-element, `scale(0 → 2.5) opacity(1 → 0)`, 400ms
- On `POST /orders` accepted: toast slides up from bottom-right (`translateY(16px) → 0`, 250ms ease-out), auto-dismisses in 3s
- On error: toast slides in with red background

**POST /orders request:** `{ type, side, price?, size }`
**POST /orders response:** `{ order_id, status: "accepted" }` — store `order_id` in `openOrders` map

**DELETE /orders/{id}:** Called when user clicks cancel on an open order. Returns 204.

---

## 14. Portfolio Widget

Displays current portfolio state. Updated from `portfolio` WS messages (on fills) and seeded from `snapshot.portfolio` on connect.

**Fields:**
- Account Equity: `equity` (cash + holdings × lastPrice, computed server-side)
- Cash: `cash` USDC
- BULL Holdings: `holdings`
- Avg Entry: `avg_entry`
- Unrealized P&L: `unrealized_pnl` — green if positive, red if negative
- Realized P&L: `realized_pnl`

**P&L flash animation:**
```typescript
// When unrealized_pnl changes, add class for 300ms then remove
pnlRef.current.classList.add(delta > 0 ? 'flash-up' : 'flash-down')
setTimeout(() => pnlRef.current.classList.remove(...), 400)
```

**Scale pulse on equity change:** `pulse-scale` keyframe, 150ms, `transform: scale(1.02)` only.

---

## 15. Full Impeccable Animation System

All animations: CSS-only + DOM refs. Zero GSAP, zero Framer Motion. Zero `setState` in hot path. Every animation communicates a state change.

| Element | Animation | Trigger | Duration |
|---------|-----------|---------|----------|
| Price ticker | Background flash (teal/red) | Direction change | 400ms |
| Depth bars | Width transition | Every book update | 120ms ease-out |
| Spread row | Scale pulse 1.04 | Spread value change | 200ms |
| Trade tape rows | Slide in from right | New trade | 180ms ease-out |
| P&L numbers | Background flash + scale 1.02 | Portfolio update | 400ms / 150ms |
| Order button | Ripple `::after` | Click | 400ms |
| Accept toast | Slide up from bottom-right | Order accepted | 250ms ease-out |
| Error toast | Slide up, red bg | Order rejected | 250ms ease-out |
| Panel load-in | Fade up (opacity + translateY 4px) | Snapshot received | 80ms stagger |

**Panel load-in order:** Header (0ms) → Chart (80ms) → OrderBook (160ms) → OrderEntry (240ms) → Portfolio (320ms)

**Motion principle:** Only `transform` and `opacity` are animated — never `width`, `height`, `padding`, or `margin`. Depth bars use `scaleX` (GPU-composited). One-shot `@keyframes` background-color flashes (price ticker, P&L) are permitted as they are not continuous `transition` animations and don't cause layout thrash.

---

## 16. Open Orders Display

Below the order entry form, a compact list of resting limit orders:

Each row: **Side** (Buy/Sell chip) | **Price** | **Size remaining** | **Cancel ✕**

- Populated from `order_update` messages with `status: 'open'` or `status: 'partial'`
- Removed on `status: 'filled'` or `status: 'cancelled'`
- Cancel button calls `DELETE /orders/{id}`
- Row entrance: same slide-in animation as trade tape

---

## 17. Docker & Compose

### `frontend/Dockerfile`

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

### `next.config.ts`

```typescript
const nextConfig = {
  output: 'standalone',
}
export default nextConfig
```

### Root `compose.yaml` update (Phase 2 addition)

```yaml
services:
  frontend:
    build:
      context: ./frontend
      args:
        NEXT_PUBLIC_WS_URL: ${NEXT_PUBLIC_WS_URL}
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}
    ports:
      - "${FRONTEND_PORT:-3000}:3000"
    depends_on:
      backend:
        condition: service_started
    # NOTE: use service_started not service_healthy — backend Dockerfile omits HEALTHCHECK
    # (distroless has no shell/wget). The /health endpoint exists but is not wired to Docker.
```

### `.env` additions for Phase 2

```
FRONTEND_PORT=3000
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
NEXT_PUBLIC_API_URL=http://localhost:8080
```

---

## 18. Key Implementation Rules

1. **Never call `setState` in `onmessage`** — always buffer + RAF
2. **Candle `time` is Unix seconds** — never pass `ts` (ms) to TradingView
3. **`stats.last_price`** is the authoritative price for the ticker — not `trade.price`
4. **`order_update` arrives for all clients** — filter by IDs in `openOrders` map
5. **`portfolio` not sent on cancel** — portfolio state unchanged by cancel; no special handling needed
6. **No `GET /candles` call on connect** — `snapshot.candles` is sufficient
7. **Chart components use `dynamic(() => ..., { ssr: false })`** — TradingView requires browser canvas
8. **All number formatting:** prices to 4 decimal places, sizes to 2, P&L to 2, percentages to 2
9. **`use client`** only at leaf component boundaries, not at layout level
10. **React 19 patterns** — no `forwardRef` where avoidable; use `ref` prop directly on DOM elements

---

## 19. Out of Scope

- Light mode
- Mobile / tablet responsive layout (desktop-only for judges)
- Authentication
- Multiple asset pairs
- Persistent order history across page reloads
- Python bots (Phase 3)
