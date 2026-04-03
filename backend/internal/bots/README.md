# Trading Bots

This package documents the two autonomous trading bots used in the submission. Both run as goroutines inside the backend process, share the same matcher input channel as human session users, and maintain isolated portfolios via `PortfolioRegistry`.

## Overview

| Bot          | User ID        | Strategy                          | Color            |
| ------------ | -------------- | --------------------------------- | ---------------- |
| Market Maker | `market_maker` | Inventory-skewed quote placement  | Indigo `#6366f1` |
| Alpha Bot    | `alpha_bot`    | EMA trend confirmation + RSI gate | Amber `#f59e0b`  |

Both bots start with **$100,000** in cash when the server starts. All state resets on server restart — there is no persistence.

---

## Bot 1: Market Maker (`market_maker.go`)

### What it does

Every 500 ms the Market Maker cancels its previous resting quotes and places a new bid/ask pair symmetrically around the current mid-price. It skews these quotes based on its current inventory to naturally reduce position risk: if it holds a long position it widens the ask (to offload inventory) and narrows the bid (to avoid buying more).

### Algorithm

```
skew     = λ × inventory
bidPrice = mid − baseSpread − skew
askPrice = mid + baseSpread + skew
```

A positive inventory (long) raises `skew`, pushing the bid down and the ask up — making it cheaper to sell and more expensive to buy, which naturally reduces the position.

### Parameters

| Constant          | Value    | Meaning                                  |
| ----------------- | -------- | ---------------------------------------- |
| `mmBaseSpread`    | `0.15`   | Half-spread in price units on each side  |
| `mmLambda`        | `0.0002` | Inventory risk aversion coefficient      |
| `mmMaxInventory`  | `500`    | Maximum allowed position (long or short) |
| `mmQuoteSize`     | `10`     | Size of each resting quote               |
| `mmQuoteInterval` | `500ms`  | Quote refresh cycle                      |

### Constraints

- Will not place a bid if inventory is already at or above `+500` (position cap hit)
- Will not place an ask if inventory is at or below `−500`
- Will not place a bid if cash < `bidPrice × quoteSize` (cash self-validation)
- Short selling is permitted on the ask side (no cash required to sell)

### Quote cycle

```
Every 500ms:
  1. Cancel all active order IDs from previous cycle
  2. Read latest mid-price from priceCh
  3. Compute skew from current inventory
  4. Place bid (if within inventory cap and cash sufficient)
  5. Place ask (if within inventory cap)
  6. Store new order IDs for next cancel round
```

### Inputs

| Parameter  | Source                                                            |
| ---------- | ----------------------------------------------------------------- |
| `priceCh`  | Fan-out from `statsTicker` in `main.go` (1s interval, last price) |
| `registry` | `PortfolioRegistry` — read via `Holdings()` and `Cash()`          |
| `inChan`   | Shared engine input channel                                       |

---

## Bot 2: Alpha Bot (`alpha_bot.go`)

### What it does

The Alpha Bot watches 1-second candle closes and trades with EMA trend confirmation plus RSI momentum confirmation. This keeps it active in smoother market regimes while preserving directional behavior.

### Algorithm

On each candle close (35-close buffer required before any signal):

```
fast = EMA(closes, 9)
slow = EMA(closes, 21)
rsi  = RSI(closes, 14)

bullishTrend = fast > slow
bearishTrend = fast < slow

if bullishTrend AND rsi ≥ 52 AND position + 50 ≤ 200 AND cash ≥ close × 50:
    BUY 50 units (market order)

if bearishTrend AND rsi ≤ 48 AND position − 50 ≥ −200:
    SELL 50 units (market order)
```

### Why RSI as a gate

In the tuned smoother market, crossover-only entry was too sparse and often produced no trades in demo windows. Using trend direction (EMA9 vs EMA21) plus RSI momentum confirmation keeps the bot directional while avoiding long inactivity.

### Parameters

| Constant        | Value | Meaning                                  |
| --------------- | ----- | ---------------------------------------- |
| `abFastPeriod`  | `9`   | Fast EMA period                          |
| `abSlowPeriod`  | `21`  | Slow EMA period                          |
| `abRSIPeriod`   | `14`  | RSI period                               |
| `abBufferSize`  | `35`  | Minimum candle closes before signaling   |
| `abTradeSize`   | `50`  | Units per market order                   |
| `abMaxPosition` | `200` | Maximum allowed position (long or short) |
| `abRSIBuyGate`  | `52`  | RSI must be at or above this to buy      |
| `abRSISellGate` | `48`  | RSI must be at or below this to sell     |

### Constraints

- Requires 35 candle closes (35 seconds) before the first signal
- Will not buy if position is at or above `+200`
- Will not sell if position is at or below `−200`
- Will not buy if cash < `candle.Close × 50` (cash self-validation)
- Short selling is permitted on sell signals

### Inputs

| Parameter  | Source                                                                     |
| ---------- | -------------------------------------------------------------------------- |
| `candleCh` | Fan-out from `statsTicker` in `main.go` — latest completed candle every 1s |
| `registry` | `PortfolioRegistry` — read via `Holdings()` and `Cash()`                   |
| `inChan`   | Shared engine input channel                                                |

---

## Indicators (`indicators.go`)

Pure functions with no side effects. Both are tested in `indicators_test.go`.

### `EMA(prices []float64, period int) float64`

Exponential Moving Average. Seeds with `prices[0]` and applies:

```
k   = 2 / (period + 1)
ema = price[i] × k + ema × (1 − k)
```

Returns `0` if `len(prices) < period`.

### `RSI(prices []float64, period int) float64`

Relative Strength Index using Wilder's smoothing. Seeds average gain/loss from the first `period` changes, then applies:

```
avgGain = (avgGain × (period − 1) + gain) / period
avgLoss = (avgLoss × (period − 1) + loss) / period
RSI     = 100 − (100 / (1 + avgGain/avgLoss))
```

Returns `0` if `len(prices) < period + 1`. Returns `100` if `avgLoss == 0` (all gains).

---

## Portfolio Architecture

Each bot has an isolated `Portfolio` managed by `PortfolioRegistry`:

```
registry := engine.NewRegistry("market_maker", "alpha_bot")
```

- Each portfolio starts with `$100,000`
- Human portfolios are created lazily per WebSocket/REST session UUID (not pre-seeded as a single `"human"` user)
- The matching engine calls `p.OnTrade(t, isBuyer)` for each relevant fill
- `Holdings()` and `Cash()` are thread-safe getters for use in bot goroutines
- Every second, `main.go` broadcasts bot portfolio states globally and routes human session portfolio updates to the owning session

### WebSocket portfolio message

```json
{
  "type": "portfolio",
  "user_id": "market_maker",
  "cash": 99500.00,
  "holdings": 50.0,
  "avg_entry": 100.10,
  "unrealized_pnl": 12.50,
  "realized_pnl": 37.20,
  "equity": 100149.70,
  "recent_fills": [
    { "ts": 1711372801000, "price": 100.10, "side": "buy", "size": 10.0 }
  ],
  "fill_count": 14,
  "ts": 1711372802000
}
```

The frontend routes bot messages by explicit IDs (`market_maker`, `alpha_bot`) to the bot observability UI.

---

## Concurrency Notes

- Both bots run in their own goroutines, started in `main.go` after the matching engine
- Bots write to `inChan` (shared with the GBM generator and HTTP handler) using non-blocking sends — orders are dropped silently if the channel is full
- `Holdings()` and `Cash()` use `sync.RWMutex` to allow concurrent reads from bot goroutines while the matching engine writes via `OnTrade`
- The `PortfolioRegistry` itself uses a `sync.RWMutex` for its internal map

---

## Validation

```bash
cd backend
go test ./internal/bots/ -v
```

Current bot tests cover:

- indicator correctness (`EMA`, `RSI`) including known-sequence and insufficient-data paths
- alpha signal triggers for bullish and bearish momentum-confirmed conditions
- alpha signal guard behavior (cash checks, blocked low-momentum states)
- trend-confirmed entries without requiring a fresh crossover tick
