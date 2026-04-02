# SYNTHETIC-BULL Trading Terminal

**OpenSoft 2026 — IIT Kharagpur**

A full-stack exchange simulator and algorithmic trading terminal. No external data feeds, no CSV files — the entire market generates itself from scratch. Three isolated portfolios, two autonomous trading bots, and a Hyperliquid-inspired trading desk built for live demonstration.

---

## What Was Built

| | |
|---|---|
| **Matching engine** | Single-goroutine price-time priority limit order book — deterministic, zero lock contention on the hot path |
| **Synthetic market** | GBM generator producing 200 messages/second (4× the required minimum) — limits, cancels, and market orders with a soft mean-reversion anchor |
| **Market Maker bot** | Inventory-skewed two-sided quoting every 500ms, self-correcting position via spread asymmetry |
| **Alpha Bot** | EMA(9/21) crossover with RSI(14) momentum gate — fires after 35-candle warmup |
| **WebSocket hub** | Non-blocking broadcast — slow clients dropped, fast ones never stall |
| **Trading terminal** | Candlestick chart (6 timeframes, VWAP, fill markers), live order book, order entry, portfolio P&L, bot observability panel |

---

## Quick Start

```bash
cp .env.example .env
docker-compose up --build
```

Open `http://localhost:3000` — the market starts immediately.

**Without Docker:**

```bash
# Terminal 1 — backend
cd backend && go run ./cmd/server/

# Terminal 2 — frontend
cd ui && npm install && npm run dev
```

---

## Architecture

```
GBM Generator ──┐
Market Maker  ──┼──► inChan (buffered 1024) ──► Matcher ──► WebSocket Hub ──► UI
Alpha Bot     ──┤                                   │
HTTP /orders  ──┘                                   ▼
                                          PortfolioRegistry
                                    (human / market_maker / alpha_bot)
```

All four order sources share a single buffered channel into the matching engine. The matcher is intentionally single-goroutine — no mutex on the matching hot path. The WebSocket hub streams book updates, trades, stats, and per-participant P&L to all connected clients.

---

## Key Features

**Trading terminal**
- Candlestick chart with 6 timeframes (1s → 5m), VWAP overlay, fill markers on every trade
- Fixed price ladder order book with animated depth bars, 3 layout modes
- Limit and market orders with live slippage estimate before submission
- Short selling fully supported — position goes negative, P&L tracks correctly end-to-end
- Keyboard-first: `B`/`S` to switch side, `Enter` to submit, `1`–`4` quick-size, `Cmd+K` command palette

**Portfolio & P&L**
- Cash, holdings, average entry, unrealized P&L, realized P&L, total equity — all live
- 600-point equity curve charted in the Performance tab
- Fill history with markers on the candlestick chart

**Bot observability**
- Live equity curves for both bots, fill tables, portfolio snapshots
- Equity curves survive browser refresh via snapshot hydration on reconnect

**Engineering**
- Single-digit millisecond WebSocket round-trip latency
- `docker-compose up --build` — one command launches everything
- All parameters configurable via environment variables — no code changes to tune

---

## API Reference

**WebSocket:** `ws://localhost:8080/ws`

| Message | When |
|---|---|
| `snapshot` | On connect — full book, candles, portfolio, fills, equity history, open orders |
| `book` | Every 100ms — top 150 price levels |
| `trade` | On every match |
| `stats` | Every 1s — OHLCV, VWAP, change % |
| `portfolio` | Every 1s + after fills — cash, holdings, P&L (all 3 participants) |
| `order_update` | On change — human order lifecycle (open → partial → filled/cancelled) |

**REST:** `http://localhost:8080`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/orders` | Place limit or market order |
| `DELETE` | `/orders/{id}` | Cancel open order |
| `GET` | `/candles?limit=300` | 1s candle history |
| `GET` | `/health` | Readiness check |

**POST /orders body:**
```json
{ "type": "limit", "side": "buy", "price": 100.50, "size": 5 }
{ "type": "market", "side": "sell", "size": 10 }
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BACKEND_PORT` | `8080` | Backend HTTP/WS port |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8080/ws` | Browser WebSocket URL |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | Browser REST URL |
| `GBM_S0` | `100.0` | Starting synthetic price |
| `GBM_MU` | `0.0` | GBM drift (zero = fair market) |
| `GBM_SIGMA` | `0.015` | GBM volatility |
| `GBM_TICK_MS` | `10` | Generator tick interval (ms) |
| `GBM_TARGET_MSGS_PER_SEC` | `200` | Total synthetic message budget |
| `GBM_CANCEL_SHARE` | `0.20` | Fraction of messages used for cancels |
| `GBM_MARKET_ORDER_SHARE` | `0.05` | Fraction of messages used for market orders |
| `GBM_MAX_RESTING` | `150` | Cap on tracked synthetic resting orders |

---

## Repository Structure

```
backend/
  cmd/server/main.go              Entry point — wires all components together
  internal/engine/                Matching engine, order book, portfolio, candles
  internal/bots/                  Market Maker + Alpha Bot
  internal/generator/             GBM synthetic market generator
  internal/api/                   REST handlers + CORS middleware
  internal/hub/                   WebSocket broadcast hub
  README.md                       Backend architecture and testing guide

ui/
  app/                            Next.js App Router entry
  components/                     Chart, OrderBook, OrderEntry, Workbench, Bots
  store/tradingStore.ts           Zustand store — all live UI state
  hooks/useWebSocket.ts           WS connection, message routing, snapshot hydration
  types/ws.ts                     TypeScript types for all WebSocket messages
  README.md                       Frontend component and store documentation

docker-compose.yaml               Launches backend + frontend together
.env.example                      Environment variable template
docs/                             Architecture report and presentation materials
```

---

## Testing

```bash
# Backend — matching engine, portfolio math, bot logic, GBM throughput
cd backend && go test ./...

# Frontend — type check + build
cd ui && npm run build
```

---

## Documentation

| File | Covers |
|---|---|
| [`backend/README.md`](backend/README.md) | Full backend: matching engine design, WS message shapes, all endpoints, testing |
| [`backend/internal/bots/README.md`](backend/internal/bots/README.md) | Bot algorithms, EMA/RSI parameters, inventory skew math, portfolio architecture |
| [`ui/README.md`](ui/README.md) | Component map, Zustand store, WebSocket routing, bot observability UI |
