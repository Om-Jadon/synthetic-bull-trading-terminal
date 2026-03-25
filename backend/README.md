# NEXTBULL Backend

This folder contains the Go backend for the trading terminal. It provides:

- A real-time in-memory matching engine (price-time priority)
- A synthetic market generator (GBM-based) that continuously places orders
- HTTP APIs for manual order entry and historical candles
- WebSocket streaming for order book, trades, stats, and portfolio updates

This README is written for readers who are new to Docker and Go.

## What You Are Running

When the backend starts, four main parts run together:

1. HTTP server on port 8080 by default
2. WebSocket hub for real-time broadcasting to clients
3. Matching engine loop (single goroutine)
4. GBM generator that injects synthetic buy/sell limit orders

All orders (from users and from the generator) are pushed into one shared channel and processed in sequence by the matcher.

## Prerequisites

You can run this backend in two ways:

1. With Docker (recommended for beginners)
2. Directly with Go on your machine

### Option A: Docker prerequisites

- Docker Engine (with Docker Compose plugin)
- Verify installation:

```bash
docker --version
docker compose version
```

### Option B: Go prerequisites

- Go 1.25.x (this repository uses Go 1.25.8 in `go.mod`)
- Verify installation:

```bash
go version
```

## Quick Start (Docker, Recommended)

Run from the repository root (not from the `backend` folder):

```bash
cp .env.example .env
docker compose up --build backend
```

What this does:

- Copies example environment variables to `.env`
- Builds `backend/Dockerfile`
- Starts the backend container and maps port 8080 to your machine

You should see a log line similar to:

```text
NEXTBULL backend listening on :8080
```

Stop it with `Ctrl+C`.

## Quick Start (Local Go, No Docker)

Run from inside the `backend` folder:

```bash
go mod download
go run ./cmd/server/
```

The server will start on `:8080` unless overridden by `BACKEND_PORT`.

## Verify It Is Running

From a new terminal:

```bash
curl -i http://localhost:8080/health
```

Expected response:

- HTTP status `200 OK`
- body: `{"status":"ok"}`

## Architecture (Code-Verified)

```text
            +-----------------------------+
            |  GBM Generator (goroutine) |
            +--------------+--------------+
                           |
                           v
      +-------------------------------------------+
      | inChan (buffered channel, size = 1024)    |
      +-------------------+-----------------------+
                          |
                          v
            +-----------------------------+
            | Matcher (single goroutine)  |
            | owns OrderBook + matching   |
            +-------------+---------------+
                          |
                          v
            +-----------------------------+
            | WebSocket Hub               |
            | broadcasts pre-serialized   |
            | JSON messages to clients    |
            +-----------------------------+

HTTP POST /orders and DELETE /orders/{id}
also push into the same inChan.
```

Design note: the matcher is intentionally single-threaded for deterministic price-time priority and to avoid lock contention on the hot path.

## Folder Layout

```text
backend/
├── cmd/server/main.go
├── internal/
│   ├── api/handlers.go
│   ├── engine/
│   │   ├── candles.go
│   │   ├── matcher.go
│   │   ├── matcher_test.go
│   │   ├── orderbook.go
│   │   ├── orderbook_test.go
│   │   ├── portfolio.go
│   │   └── types.go
│   ├── generator/gbm.go
│   └── hub/hub.go
├── Dockerfile
├── go.mod
└── go.sum
```

## API Reference

Base URL (local): `http://localhost:8080`

### `POST /orders`

Accepts a new human order.

Limit order example:

```bash
curl -X POST http://localhost:8080/orders \
  -H "Content-Type: application/json" \
  -d '{"type":"limit","side":"buy","price":100.25,"size":2}'
```

Market order example:

```bash
curl -X POST http://localhost:8080/orders \
  -H "Content-Type: application/json" \
  -d '{"type":"market","side":"sell","size":1.5}'
```

Response shape:

```json
{
  "order_id": "o_<uuid>",
  "status": "accepted"
}
```

Validation rules implemented in code:

- `size` must be `> 0`
- `type` must be `limit` or `market`
- `side` must be `buy` or `sell`
- for `limit`, `price` must be `> 0`

### `DELETE /orders/{id}`

Requests cancellation by order ID.

```bash
curl -X DELETE http://localhost:8080/orders/o_your_order_id
```

Response: `204 No Content`

### `GET /candles?limit=300`

Returns candle history (1-second candles).

```bash
curl http://localhost:8080/candles?limit=100
```

Notes:

- default `limit` is 300
- allowed range is 1 to 1000

Response shape:

```json
{
  "candles": [
    {
      "time": 1711372800,
      "open": 100.1,
      "high": 100.4,
      "low": 99.9,
      "close": 100.2,
      "volume": 125.5
    }
  ]
}
```

### `GET /health`

Readiness endpoint used by Docker health checks.

```bash
curl http://localhost:8080/health
```

Returns:

- `200` with `{"status":"ok"}` when ready
- `503` with `not ready` during startup

### `GET /ws`

WebSocket endpoint for live stream.

Local URL:

```text
ws://localhost:8080/ws
```

## WebSocket Message Types

All WebSocket messages are JSON.

### 1. `snapshot` (sent once on connect)

Contains initial state:

- `book`: top bids/asks
- `candles`: recent candles (up to 300)
- `portfolio`: human portfolio snapshot

### 2. `book` (every 100ms)

Order book depth update:

```json
{
  "type": "book",
  "bids": [[100.5, 10.0]],
  "asks": [[100.6, 8.5]],
  "ts": 1711372800123
}
```

### 3. `trade` (on every executed trade)

```json
{
  "type": "trade",
  "id": "t_<uuid>",
  "price": 100.5,
  "size": 2,
  "side": "buy",
  "ts": 1711372800456
}
```

`side` is aggressor (taker) side.

### 4. `stats` (every 1 second)

Session summary values (`session_open`, `session_high`, `session_low`, `last_price`, `session_volume`, `change_pct`, `ts`).

### 5. `order_update` (human order lifecycle)

Statuses used by the matcher:

- `open`
- `partial`
- `filled`
- `cancelled`

### 6. `portfolio` (after human fills)

Includes:

- `cash`
- `holdings`
- `avg_entry`
- `unrealized_pnl`
- `realized_pnl`
- `equity`

Time fields:

- most `ts` fields are Unix milliseconds
- candle `time` is Unix seconds

## Environment Variables

These backend variables are consumed by `cmd/server/main.go`:

| Variable       | Default | Meaning                                 |
| -------------- | ------- | --------------------------------------- |
| `BACKEND_PORT` | `8080`  | HTTP/WS listen port                     |
| `GBM_S0`       | `100.0` | Initial synthetic price                 |
| `GBM_MU`       | `0.0`   | GBM drift                               |
| `GBM_SIGMA`    | `0.02`  | GBM volatility                          |
| `GBM_TICK_MS`  | `10`    | Generator tick interval in milliseconds |

The repository root `.env.example` already includes these values.

## Testing

Run all backend tests:

```bash
cd backend
go test ./...
```

Run only engine tests in verbose mode:

```bash
go test ./internal/engine/... -v
```

Current test files in this folder cover:

- order book behaviors (best bid/ask, cancel, depth, FIFO)
- matching behaviors (limit, market sweep, cancel, partial fill updates)

## Docker Notes (Beginner-Friendly)

`backend/Dockerfile` is multi-stage:

1. Build stage uses `golang:1.25-alpine`
2. Final runtime stage uses `gcr.io/distroless/static-debian12:nonroot`

Why this is good practice:

- smaller production image
- fewer unnecessary tools in runtime container
- non-root runtime user by default

The project-level `compose.yaml` defines a `backend` service and reads environment variables from `.env`.

## Troubleshooting

### Port 8080 already in use

Set a different host port mapping in `compose.yaml` or stop the process using 8080.

### Health endpoint returns `503 not ready`

Wait a moment and retry. The readiness flag is set during startup before normal serving.

### `POST /orders` returns 400

Check request JSON against validation rules (`type`, `side`, `size`, and `price` for limit orders).

### No WebSocket updates seen

- verify backend is running
- verify client is connected to `ws://localhost:8080/ws`
- check browser/network console for connection errors

## Implementation Notes

- The matching loop is single-goroutine by design (deterministic sequencing).
- The generator may drop orders when the input channel is full (non-blocking send).
- Slow WebSocket clients are disconnected when their outbound buffer fills.

These behaviors are intentional and implemented in the current codebase.
