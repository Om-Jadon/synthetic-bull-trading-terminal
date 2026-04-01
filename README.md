# NEXTBULL Trading Terminal

OpenSoft 2026 — IIT Kharagpur

A real-time trading terminal: live matching engine, GBM synthetic market, two autonomous trading bots, and a Hyperliquid-inspired UI with full micro-animation treatment.

---

## Repository Structure

```
backend/                    Go backend — matching engine, bots, WebSocket hub
  internal/
    bots/                   Market Maker + Alpha Bot (README inside)
    engine/                 Matcher, order book, portfolio, candles
    generator/              GBM synthetic market generator
    api/                    REST handlers
    hub/                    WebSocket broadcast hub
  cmd/server/main.go        Entry point — wires everything together
  README.md                 Full backend documentation

ui/                         Next.js 15 frontend — trading terminal UI
  app/                      Next.js app router entry
  components/               Panel components (see below)
  store/tradingStore.ts     Zustand store — all live state
  hooks/useWebSocket.ts     WebSocket connection + message routing
  types/ws.ts               TypeScript types for all WS messages
  README.md                 Frontend documentation

docker-compose.yaml         Docker Compose — runs both services
.env.example                Environment variable template
docs/                       Design documents and specs
CLAUDE.md                   AI context for this codebase
```

---

## Quick Start

```bash
cp .env.example .env
docker-compose up --build
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8080`

**Without Docker:**

```bash
# Terminal 1 — backend
cd backend && go run ./cmd/server/

# Terminal 2 — frontend
cd ui && npm install && npm run dev
```

---

## What Is Running

When both services start, the following run together:

| Component        | Role                                                          |
| ---------------- | ------------------------------------------------------------- |
| Matching engine  | Price-time priority limit order book                          |
| GBM generator    | ~100 synthetic orders/second, creates live price action       |
| Market Maker bot | Inventory-skewed quote placement every 500 ms                 |
| Alpha Bot        | EMA crossover + RSI strategy, fires market orders on signals  |
| WebSocket hub    | Streams book, trades, stats, portfolio updates to all clients |
| HTTP API         | Human order entry, cancellation, candle history               |

All four order sources share a single `inChan`. Each participant has an isolated `$100,000` portfolio.

---

## API Reference

**WebSocket:** `ws://localhost:8080/ws`

| Message        | When                                                               |
| -------------- | ------------------------------------------------------------------ |
| `snapshot`     | On connect — book, candles, portfolio, fills, equity history       |
| `book`         | Every 100 ms — top 20 bids/asks                                    |
| `trade`        | On match — every executed trade                                    |
| `stats`        | Every 1 s — OHLCV, VWAP, change %                                  |
| `portfolio`    | Every 1 s + after fills — cash, holdings, P&L (all 3 participants) |
| `order_update` | On change — human order lifecycle                                  |

**REST:** `http://localhost:8080`

| Method   | Endpoint             | Description                 |
| -------- | -------------------- | --------------------------- |
| `POST`   | `/orders`            | Place limit or market order |
| `DELETE` | `/orders/:id`        | Cancel open order           |
| `GET`    | `/candles?limit=300` | 1 s candle history          |
| `GET`    | `/health`            | Health check                |

---

## Environment Variables

| Variable                  | Default                  | Description                                           |
| ------------------------- | ------------------------ | ----------------------------------------------------- |
| `BACKEND_PORT`            | `8080`                   | Backend HTTP/WS port                                  |
| `FRONTEND_PORT`           | `3000`                   | Frontend port                                         |
| `NEXT_PUBLIC_WS_URL`      | `ws://localhost:8080/ws` | Browser WebSocket URL                                 |
| `NEXT_PUBLIC_API_URL`     | `http://localhost:8080`  | Browser REST URL                                      |
| `GBM_S0`                  | `100.0`                  | Starting synthetic price                              |
| `GBM_MU`                  | `0.0`                    | GBM drift (neutral baseline)                          |
| `GBM_SIGMA`               | `0.015`                  | GBM volatility                                        |
| `GBM_TICK_MS`             | `10`                     | Generator tick interval                               |
| `GBM_TARGET_MSGS_PER_SEC` | `200`                    | Synthetic flow budget (limits + cancels + markets)    |
| `GBM_CANCEL_SHARE`        | `0.10`                   | Fraction of synthetic messages used for cancels       |
| `GBM_MARKET_ORDER_SHARE`  | `0.05`                   | Fraction of synthetic messages used for market orders |
| `GBM_MAX_RESTING`         | `600`                    | Cap for tracked synthetic resting orders              |

---

## Documentation Index

| File                                                                 | What it covers                                                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`backend/README.md`](backend/README.md)                             | Full backend: API reference, WS message shapes, architecture, environment variables, testing, Docker notes |
| [`backend/internal/bots/README.md`](backend/internal/bots/README.md) | Bot algorithms, parameters, indicators API, portfolio architecture, concurrency notes                      |
| [`ui/README.md`](ui/README.md)                                       | Frontend: component map, store architecture, WebSocket routing, bot observability UI, quality checks       |

---

## Testing

```bash
# Backend
cd backend && go test ./...

# Frontend
cd ui && npm run test
```
