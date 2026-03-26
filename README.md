# NEXTBULL Trading Terminal

OpenSoft 2026 — IIT Kharagpur

A real-time trading terminal with a live matching engine, synthetic market generator, and WebSocket data streaming.

---

## Repository Structure

```
backend/   
ui/        
```

---

## Backend

The backend is complete and ready to use. It runs a:

- Price-time priority matching engine
- GBM-based synthetic market generator (continuous live prices)
- WebSocket hub streaming order book, trades, stats, and portfolio updates
- REST API for placing and cancelling orders

Full documentation: [`backend/README.md`](backend/README.md)

### Quick Start

**With Docker (recommended):**

```bash
cp .env.example .env
docker compose up --build
```

Backend runs on `http://localhost:8080`

**Without Docker:**

```bash
cd backend
go run ./cmd/server
```

---

## API Reference

### WebSocket

Connect to `ws://localhost:8080/ws`

On connect you receive a `snapshot` message with the current order book, last 300 candles, and portfolio state. After that, messages stream in real time:

| Message        | Frequency | Description                    |
| -------------- | --------- | ------------------------------ |
| `book`         | 100ms     | Top 20 bids and asks           |
| `trade`        | On match  | Every executed trade           |
| `stats`        | 1s        | Session OHLCV and price change |
| `portfolio`    | On fill   | Cash, holdings, P&L            |
| `order_update` | On change | Order status updates           |

### REST

| Method   | Endpoint             | Description                   |
| -------- | -------------------- | ----------------------------- |
| `POST`   | `/orders`            | Place a limit or market order |
| `DELETE` | `/orders/:id`        | Cancel an open order          |
| `GET`    | `/candles?limit=300` | Historical 1s candles         |
| `GET`    | `/health`            | Health check                  |

**Place order:**
```json
POST /orders
{ "type": "limit", "side": "buy", "price": 100.50, "size": 10 }
```

**Response:**
```json
{ "order_id": "abc123", "status": "accepted" }
```

---

## Frontend

Build your UI inside the `ui/` folder on your own branch.

Your frontend just needs to:
1. Connect to `ws://localhost:8080/ws`
2. Optionally call `POST /orders` and `DELETE /orders/:id`

Everything else — framework, styling, layout — is your call.

```bash
git checkout -b ui/your-team-name
```

---

## Environment Variables

Copy `.env.example` to `.env` before running:

```bash
cp .env.example .env
```

| Variable       | Default | Description                     |
| -------------- | ------- | ------------------------------- |
| `BACKEND_PORT` | `8080`  | Backend HTTP/WS port            |
| `GBM_S0`       | `100.0` | Starting price for BULL/USDC    |
| `GBM_MU`       | `0.0`   | GBM drift                       |
| `GBM_SIGMA`    | `0.02`  | GBM volatility                  |
| `GBM_TICK_MS`  | `50`    | Market generator tick rate (ms) |
