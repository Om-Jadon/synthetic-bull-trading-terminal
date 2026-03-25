# NEXTBULL Trading Terminal — Design Spec
**Date:** 2026-03-25
**Competition:** OpenSoft 2026 × IIT Kharagpur × NextBull
**Project:** Project Synthetic-Bull

---

## 1. Objective

Build a fully self-contained, real-time simulated cryptocurrency exchange with an integrated web trading terminal. The system generates its own synthetic market activity, maintains a live limit order book, and allows a human user to trade against it. No external data sources permitted.

**Asset pair:** BULL/USDC
**App name:** NEXTBULL
**Starting capital:** $100,000 USDC (human user)
**Short selling:** Permitted

---

## 2. Build Order

1. **Phase 1 — Go Backend:** Matching engine + GBM market generator + WebSocket server
2. **Phase 2 — Next.js Frontend:** Hyperliquid-style trading terminal
3. **Phase 3 — Python Bots:** Market maker + alpha bot (tie-breaker, built last)
4. **Phase 4 — Report:** Architecture & Quant Report (max 10 pages, PDF submission). Required sections:
   - System architecture diagram (data flow from GBM → engine → WebSocket → frontend)
   - Matching engine design (data structures, price-time priority algorithm, complexity analysis)
   - GBM model description (formula, parameters: S0, μ, σ, tick rate, rationale for choices)
   - WebSocket message protocol (message types, throttling strategy)
   - Performance analysis (orders/sec throughput, latency, frontend rendering strategy)
   - Bot logic — Avellaneda-Stoikov MM + MACD/RSI alpha (Phase 3, if completed)

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Go Backend (:8080)                 │
│                                                      │
│  GBM Generator ──► inChan ──► Matching Engine        │
│  HTTP /orders  ──►           (single goroutine)      │
│                                    │                 │
│                               outChan                │
│                                    │                 │
│                              WebSocket Hub           │
│                            (broadcast goroutine)     │
└────────────────────────────┬────────────────────────┘
                             │ ws://localhost:8080/ws
                    ┌────────▼────────┐
                    │  Next.js (:3000) │
                    │  NEXTBULL        │
                    │  BULL/USDC       │
                    └─────────────────┘
```

**Data flow:**
1. GBM generator ticks every ~10ms, submits randomized limit bids/asks into `inChan`
2. Matching engine (single goroutine, no mutexes on hot path) processes orders, emits trades + book updates to `outChan`
3. WebSocket hub fans out pre-serialized `[]byte` to all connected browser clients
4. Human orders from the frontend `POST /orders`, entering the same `inChan`

---

## 4. Module 1 — Go Backend

### 4.1 Tech Stack

| Component | Choice | Reason |
|-----------|--------|--------|
| Language | Go 1.25 | Container-aware GOMAXPROCS, Green Tea GC, Swiss Tables maps |
| HTTP | `net/http` stdlib | Method-aware routing in Go 1.22+, no framework needed at 100 orders/sec |
| WebSocket | `github.com/coder/websocket` | Safe concurrent writes, context.Context integration |
| Order book | `github.com/google/btree` v1.1.3 | Cache-friendly BTreeG[T], O(log M) insert, cheap snapshots via Clone() |
| Docker base | `gcr.io/distroless/static-debian12:nonroot` | ~10-15MB final image, zero CVEs |

### 4.2 Matching Engine

**Data structures:**
- `bids`: `BTreeG[PriceLevel]` — descending order (best bid = max)
- `asks`: `BTreeG[PriceLevel]` — ascending order (best ask = min)
- `orders`: `map[string]*Order` — O(1) cancel lookups
- `PriceLevel`: price + total volume + doubly-linked FIFO list of orders

**Supported message types:**
- `LimitOrder` — price + size + side (buy/sell)
- `MarketOrder` — size + side only
- `CancelOrder` — order ID

**Matching algorithm:** Strict Price-Time priority
- Limit buy: match against asks ascending until filled or no match
- Limit ask: match against bids descending until filled or no match
- Market order: sweep the book until filled (partial fills allowed)
- Unmatched limit remainder rests in the book

**Concurrency pattern:** Single-goroutine actor
```
HTTP handlers ──► buffered chan Order (size 1024) ──► [matching goroutine] ──► chan Event ──► Hub
```
No mutexes on the matching core. Deterministic, cache-local, lock-free on hot path.

### 4.3 GBM Market Generator

**Model:**
```
St = S0 * exp((μ - σ²/2)*t + σ*Wt)
```

**Parameters:**
- `S0 = 100.0` (initial BULL price in USDC)
- `μ = 0.0` (zero drift — fair market)
- `σ = 0.02` (2% volatility)
- Tick interval: 10ms → ~100 messages/sec

**Per tick behavior:**
- Compute new GBM price
- Generate 3–5 randomized limit bids at prices `[midPrice * (1 - rand*0.005)]` with random sizes 1–50
- Generate 3–5 randomized limit asks at prices `[midPrice * (1 + rand*0.005)]` with random sizes 1–50
- Push all into `inChan`

This produces realistic bid/ask spread, varying depth, and continuous liquidity.

### 4.4 WebSocket Hub

**Pattern:** Single broadcast goroutine owns the client map
- Each client gets a dedicated `writePump` goroutine with a buffered send channel (size 256)
- Slow clients whose buffers fill are disconnected (never block broadcast)
- Messages pre-serialized as `[]byte` once before broadcast (never per-client)
- Order book snapshots throttled to every 100ms

### 4.5 WebSocket Message Contract

```jsonc
// Order book snapshot — sent every 100ms
{
  "type": "book",
  "bids": [[40.290, 84.40], [40.281, 5.14], ...],  // [price, size] top 20
  "asks": [[40.306, 23.39], [40.305, 7.44], ...],  // [price, size] top 20
  "ts": 1743859200000
}

// Trade execution — sent immediately on match
// "side" = aggressor/taker side (buy = taker bought, sell = taker sold) — used for trade tape color
{
  "type": "trade",
  "id": "t_abc123",
  "price": 40.291,
  "size": 12.88,
  "side": "buy",
  "ts": 1743859200001
}

// Session stats — sent every 1s (no 24h data; simulation starts fresh each run)
{
  "type": "stats",
  "session_open": 100.00,
  "session_high": 102.45,
  "session_low": 99.10,
  "last_price": 101.33,
  "session_volume": 4521.00,
  "change_pct": 1.33,
  "ts": 1743859200000
}

// Portfolio update — sent after any human order fill or cancellation
// unrealized_pnl = mark-to-market on open position; realized_pnl = closed trades only
// equity = cash + holdings * last_price (computed server-side, not client-side)
{
  "type": "portfolio",
  "cash": 99500.00,
  "holdings": 5.00,
  "avg_entry": 40.10,
  "unrealized_pnl": 250.00,
  "realized_pnl": 0.00,
  "equity": 99701.45,
  "ts": 1743859200002
}

// Order status update — sent when a human order changes state
// One event is emitted per individual match (partial fill emits status:"partial" each time a fill occurs).
// Final full fill emits status:"filled". Cancel emits status:"cancelled" with filled_size=total filled so far.
{
  "type": "order_update",
  "order_id": "o_abc123",
  "status": "open|partial|filled|cancelled",
  "filled_size": 3.00,
  "remaining_size": 2.00,
  "price": 40.10,
  "side": "buy",
  "ts": 1743859200003
}

// TIME UNITS NOTE:
// All "ts" fields are Unix milliseconds.
// Candle "time" fields are Unix seconds (required by TradingView Lightweight Charts v5).
// The frontend must never mix these units.

// Connection snapshot — sent ONCE immediately on WebSocket connect
// Seeds the frontend with recent candle history so the chart is not empty on load
{
  "type": "snapshot",
  "book": {
    "bids": [[40.290, 84.40], [40.281, 5.14]],
    "asks": [[40.306, 23.39], [40.305, 7.44]],
    "ts": 1743859200000
  },
  "candles": [
    { "time": 1743859140, "open": 100.1, "high": 100.5, "low": 99.8, "close": 100.3, "volume": 451.2 }
  ],
  "portfolio": {
    "cash": 100000.00, "holdings": 0.00, "avg_entry": 0.00,
    "unrealized_pnl": 0.00, "realized_pnl": 0.00, "equity": 100000.00,
    "ts": 1743859200000
  },
  "ts": 1743859200000
}
```

### 4.6 HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/orders` | Submit limit or market order |
| `DELETE` | `/orders/{id}` | Cancel a resting limit order |
| `GET` | `/candles` | Seed chart with historical candles (`?limit=300`) |
| `GET` | `/health` | Docker healthcheck (`atomic.Bool` ready flag) |
| `GET` | `/ws` | WebSocket upgrade |

**POST /orders request:**
```jsonc
{ "type": "limit|market", "side": "buy|sell", "price": 40.10, "size": 5.0 }
// price is omitted for market orders
```

**POST /orders response:**
```jsonc
{ "order_id": "o_abc123", "status": "accepted" }
// order_id is used for DELETE /orders/{id} and matches order_update WS messages
```

**GET /candles response** — used to seed the chart on initial page load (alternative to waiting for snapshot WS message):
```jsonc
{
  "candles": [
    { "time": 1743859140, "open": 100.1, "high": 100.5, "low": 99.8, "close": 100.3, "volume": 451.2 },
    ...
  ]
}
// Returns last 300 1-second candles. "time" is Unix seconds (required by TradingView Lightweight Charts).
// Query param: ?limit=300 (default 300, max 1000)
```

### 4.7 Project Structure

```
backend/
├── cmd/server/main.go          # Entry point, wires everything
├── internal/
│   ├── engine/
│   │   ├── orderbook.go        # BTree-based LOB
│   │   ├── matcher.go          # Price-time priority matching
│   │   └── types.go            # Order, Trade, PriceLevel types
│   ├── generator/
│   │   └── gbm.go              # GBM market generator goroutine
│   ├── hub/
│   │   └── hub.go              # WebSocket hub + broadcast
│   └── api/
│       └── handlers.go         # HTTP handlers
├── go.mod
├── go.sum
└── Dockerfile
```

---

## 5. Module 2 — Next.js Frontend

### 5.1 Tech Stack

| Component | Choice |
|-----------|--------|
| Framework | Next.js 15.x (App Router) |
| Charts | TradingView Lightweight Charts v5.1.0 |
| State | Zustand v5.0.8 |
| Styling | Tailwind CSS v4.2.2 |
| Language | TypeScript |

### 5.2 Layout

Exact Hyperliquid layout replicated for NEXTBULL:

```
┌──────────────────────────────────────────────────────────────────────┐
│ NEXTBULL  Trade  Portfolio                                           │
├────┬──────────────────────────────────┬─────────────┬───────────────┤
│    │ BULL/USDC  $40.29  +1.33% (session)  Vol  │             │ Market│Limit  │
│    ├──────────────────────────────────┤ Order Book  │ Buy  │ Sell  │
│ T  │                                  │  + Trades   │               │
│ o  │   Candlestick Chart              │  (3 modes)  │ Price / Size  │
│ o  │   (1s candles, live OHLCV)       │             │               │
│ l  │                                  │             │               │
│ s  ├──────────────────────────────────┤             │ Place Order   │
│    │   Volume bars                    │             ├───────────────┤
│    │                                  │             │ Account Equity│
│    ├──────────────────────────────────┴─────────────┤ Cash: $X     │
│    │  Cash: $X  │  BULL: X  │  P&L: +$X  │         │ BULL: X      │
└────┴────────────────────────────────────────────────┴───────────────┘
```

### 5.3 Order Book — Three View Modes

Toggled via icons in the order book header (identical to Hyperliquid):

- **Tab mode:** Order Book and Trades as tabs — user switches between them. Order book alone fills the panel.
- **Stacked mode:** Order Book on top half, Trades on bottom half of the same panel.
- **Large mode:** Order Book and Trades side-by-side, each getting equal width. Chart shrinks to accommodate.

### 5.4 Order Book Rendering

Each row displays:
- Price (colored teal for bids, red for asks)
- Size
- Cumulative total
- **Animated depth bar** — background width proportional to cumulative size relative to max cumulative size, color-faded, animates smoothly on every update

Spread row centered between asks and bids: absolute spread value + percentage.

### 5.5 Candlestick Chart

- **Library:** TradingView Lightweight Charts v5.1.0 (v5 API: `chart.addSeries(CandlestickSeries, options)`)
- **Interval:** 1-second candles built live from the trade stream
- **Seed data:** On connect, the `snapshot` WS message provides last 300 1s candles — chart is never empty for judges
- **OHLCV:** Each incoming `trade` event updates current candle O/H/L/C/V; new candle opens each second
- **Volume:** Separate volume series in sub-pane (teal/red colored by candle direction)
- **Controlled entirely via refs** — zero React re-renders on tick
- **Colors:** `#26a69a` bull candles, `#ef5350` bear candles

### 5.6 Real-Time Performance Strategy

```
WebSocket onmessage ──► bufferRef.current.push(msg)
                              │
                    requestAnimationFrame (60Hz)
                              │
                    process buffer ──► setState once ──► React renders
                              │
                    seriesRef.current.update(candle)  ← bypasses React
```

- `onmessage` never calls `setState` — writes to a `useRef` buffer only
- RAF loop drains buffer at 60fps, calls `setState` once per frame
- Chart updates bypass React entirely via refs
- DOM refs for live ticker price (`priceRef.current.textContent = newPrice`)
- Zustand external store allows WebSocket handler to update state outside React tree

### 5.7 Order Entry Panel

- **Market / Limit** tabs
- **Buy / Sell** toggle (teal/red)
- Price input (Limit only, pre-filled with mid-price)
- Size input (in BULL)
- "Place Order" button → `POST /orders`
- Available balance shown above inputs
- Order Value + estimated fees shown below

### 5.8 Portfolio Widget (right panel bottom)

- Account Equity (cash + holdings value at current price)
- Cash balance (USDC)
- BULL holdings
- Live P&L (green/red, flashes on change)

### 5.9 Color Theme

```css
@import "tailwindcss";
@theme {
  --color-bg-primary: #0e1117;
  --color-bg-panel: #1a1d29;
  --color-bg-row: #131722;
  --color-bull: #26a69a;
  --color-bear: #ef5350;
  --color-text-primary: #e0e0e0;
  --color-text-muted: #6b7280;
  --color-border: #1e222d;
  --color-spread: #2a2d3e;
}
```

### 5.10 Project Structure

```
frontend/
├── app/
│   ├── layout.tsx              # Shell, fonts, metadata
│   └── page.tsx                # Trading page (use client)
├── components/
│   ├── Chart/
│   │   ├── CandlestickChart.tsx
│   │   └── useCandles.ts       # Candle aggregation from trade stream
│   ├── OrderBook/
│   │   ├── OrderBook.tsx       # Container with view mode switcher
│   │   ├── OrderBookTab.tsx    # Tab view
│   │   ├── OrderBookStacked.tsx# Stacked view
│   │   ├── OrderBookLarge.tsx  # Large view
│   │   ├── OrderRow.tsx        # Single row with depth bar
│   │   └── SpreadRow.tsx
│   ├── Trades/
│   │   └── TradeTape.tsx       # Scrolling recent trades list
│   ├── OrderEntry/
│   │   └── OrderEntry.tsx      # Market/Limit order panel
│   ├── Portfolio/
│   │   └── PortfolioWidget.tsx
│   └── Header/
│       └── AssetBar.tsx        # Price, session change %, session volume
├── store/
│   └── tradingStore.ts         # Zustand store (orderbook, trades, portfolio)
├── hooks/
│   └── useWebSocket.ts         # RAF-batched WebSocket hook
├── lib/
│   └── api.ts                  # POST /orders, DELETE /orders/{id}
└── Dockerfile
```

---

## 6. Infrastructure

### 6.1 Docker Compose

Single command: `docker compose up`

Services:
- `backend` — Go binary, distroless, exposes `:8080`
- `frontend` — Next.js standalone, exposes `:3000`

Startup order: frontend `depends_on` backend with `condition: service_healthy`.

Health check: `GET /health` returns 200 only after matching engine is initialized (`atomic.Bool` ready flag).

### 6.2 Multi-Stage Builds

- **Go:** `golang:1.25-alpine` → `gcr.io/distroless/static-debian12:nonroot` (~12MB)
- **Next.js:** `node:22-alpine` with `output: 'standalone'` → ~110MB

### 6.3 Environment

```
# .env (auto-loaded by Compose)
BACKEND_PORT=8080
FRONTEND_PORT=3000

# Browser-facing URLs (NEXT_PUBLIC_ = injected into client bundle)
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
NEXT_PUBLIC_API_URL=http://localhost:8080

# Internal Docker DNS — used for server-side Next.js calls (never expose to browser)
BACKEND_INTERNAL_URL=http://backend:8080

GBM_S0=100.0
GBM_MU=0.0
GBM_SIGMA=0.02
GBM_TICK_MS=10
```

---

## 7. Scoring Alignment

| Criterion | Weight | How we win |
|-----------|--------|------------|
| Frontend & UX | 50% | Hyperliquid-quality terminal, animated depth bars, 60fps, 3 view modes, polished dark theme |
| Backend & Architecture | 20% | Single-goroutine actor, btree LOB, coder/websocket hub, 100 orders/sec sustained |
| Code Quality & Deployment | 20% | Clean module boundaries, distroless Docker, one `docker compose up` |
| Quant & Bot Logic | 5% bonus | Avellaneda-Stoikov MM + MACD/RSI alpha bot (Phase 3) |

---

## 8. Out of Scope (Phase 1 & 2)

- Python trading bots (Phase 3)
- Multiple asset pairs
- Persistent storage / database
- Authentication
- External data feeds
