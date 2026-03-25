# NEXTBULL Backend

Go matching engine + GBM market generator + WebSocket hub.

## Quick Start

```bash
# Run locally
cd backend
GBM_S0=100 GBM_TICK_MS=10 go run ./cmd/server/

# Run with Docker (from repo root)
cp .env.example .env
docker-compose up --build
```

Server starts on `:8080`.

---

## Architecture

```
inChan (buffered 1024)
     │
     ▼
┌─────────────┐     trades/updates     ┌──────────┐     JSON     ┌─────────┐
│  GBM Gen    │ ──────────────────────▶│  Matcher │ ──────────▶  │   Hub   │──▶ WS clients
│  (goroutine)│                        │ (single  │              │         │
└─────────────┘                        │  goroutine)             └─────────┘
                                       └──────────┘
HTTP handlers ──────────────────────────────▲
(POST /orders, DELETE /orders/{id})         │ human orders via inChan
```

**Key rule:** The Matcher runs on a **single goroutine** — no mutexes on the hot path. All orders (human + GBM) go through `inChan`. Results fan out through the Hub.

---

## File Map

```
backend/
├── cmd/server/main.go              # Wires everything, starts goroutines
└── internal/
    ├── engine/
    │   ├── types.go                # Order, Trade, PriceLevel, Event types
    │   ├── orderbook.go            # BTree limit order book, O(1) cancel
    │   ├── orderbook_test.go
    │   ├── matcher.go              # Price-time matching (single goroutine)
    │   ├── matcher_test.go
    │   ├── candles.go              # 1s OHLCV ring buffer + session stats
    │   └── portfolio.go            # Human P&L tracker (cash, holdings, PnL)
    ├── generator/
    │   └── gbm.go                  # GBM price process, ~100 orders/sec
    ├── hub/
    │   └── hub.go                  # WebSocket hub, per-client write pump
    └── api/
        └── handlers.go             # HTTP handlers + CORS middleware
```

---

## HTTP API

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/orders` | `{"type":"limit","side":"buy","price":100,"size":10}` | `{"order_id":"o_...","status":"accepted"}` |
| `POST` | `/orders` | `{"type":"market","side":"sell","size":5}` | `{"order_id":"o_...","status":"accepted"}` |
| `DELETE` | `/orders/{id}` | — | `204 No Content` |
| `GET` | `/candles?limit=300` | — | `{"candles":[...]}` |
| `GET` | `/health` | — | `{"status":"ok"}` |
| `GET` | `/ws` | — | WebSocket upgrade |

---

## WebSocket Messages

All messages are JSON. Connect to `ws://localhost:8080/ws`.

**On connect — snapshot (once):**
```json
{
  "type": "snapshot",
  "book": { "bids": [[100.5, 20], ...], "asks": [[100.6, 15], ...], "ts": 1234 },
  "candles": [{ "time": 1234, "open": 100, "high": 101, "low": 99, "close": 100.5, "volume": 500 }],
  "portfolio": { ... },
  "ts": 1234
}
```

**Every 100ms — order book:**
```json
{ "type": "book", "bids": [[price, size], ...], "asks": [[price, size], ...], "ts": 1234 }
```

**On each trade:**
```json
{ "type": "trade", "id": "t_...", "price": 100.5, "size": 5, "side": "buy", "ts": 1234 }
```
`side` = aggressor/taker side (used for trade tape color: green=buy, red=sell)

**Every 1s — session stats:**
```json
{ "type": "stats", "session_open": 100, "session_high": 105, "session_low": 98, "last_price": 102, "session_volume": 12400, "change_pct": 2.0, "ts": 1234 }
```

**On human order fill (partial or full):**
```json
{ "type": "order_update", "order_id": "o_...", "status": "open|partial|filled|cancelled", "filled_size": 3, "remaining_size": 7, "price": 100, "side": "buy", "ts": 1234 }
```

**After human fill — portfolio:**
```json
{ "type": "portfolio", "cash": 99500, "holdings": 5, "avg_entry": 100, "unrealized_pnl": 10, "realized_pnl": 0, "equity": 100010, "ts": 1234 }
```

> **Time units:** `ts` fields are Unix **milliseconds**. Candle `time` field is Unix **seconds** (TradingView requirement).

---

## Order Book Design

- **BTree** (`github.com/google/btree` v1.1.3) — one tree for bids (descending), one for asks (ascending)
- **Best bid** = highest price = `bids.Min()`
- **Best ask** = lowest price = `asks.Min()`
- **O(1) cancel** via `orderIndex` map (`orderID → *LevelOrder`)
- **FIFO within level** — doubly-linked list, new orders appended to tail, matched from head

## GBM Generator

Each tick (10ms by default):
```
S(t+dt) = S(t) × exp((μ - σ²/2)×dt + σ×√dt×Z)    where Z ~ N(0,1)
```
Emits 3–5 bid and 3–5 ask limit orders per tick, spread 0–0.5% around mid.

Default params: `S0=100`, `μ=0`, `σ=0.02`, `tick=10ms` → ~70 orders/tick × 100 ticks/sec = ~7000 orders/sec flowing through the engine.

## Portfolio Tracking

The `Trade` struct carries `HumanInvolved` and `HumanIsBuyer` fields so the portfolio correctly updates whether the human was the **maker** (sitting in book) or the **taker** (incoming order). This matters because the incoming order `o` is always the system order when a human maker gets hit.

---

## Running Tests

```bash
cd backend
go test ./...         # all tests
go test ./internal/engine/... -v   # verbose engine tests
```

14 tests covering: order book (8) and matching engine (6).

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_PORT` | `8080` | HTTP/WS listen port |
| `GBM_S0` | `100.0` | Initial asset price |
| `GBM_MU` | `0.0` | Drift (0 = fair market) |
| `GBM_SIGMA` | `0.02` | Volatility |
| `GBM_TICK_MS` | `10` | Generator tick interval (ms) |
