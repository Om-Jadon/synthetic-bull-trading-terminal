# NEXTBULL Trading Terminal — Project Roadmap

**Competition:** OpenSoft 2026 × IIT Kharagpur × NextBull
**Project:** Full-stack Exchange Simulator & Algorithmic Trading Terminal
**Asset:** BULL/USDC
**Goal:** WIN — delivering a production-grade Hyperliquid-style terminal

This document provides a high-level overview. For detailed technical specifications and implementation plans, see:
- **Design Spec:** [`docs/superpowers/specs/2026-03-25-nextbull-trading-terminal-design.md`](docs/superpowers/specs/2026-03-25-nextbull-trading-terminal-design.md)
- **Phase 1 Plan (Backend):** [`docs/superpowers/plans/2026-03-25-phase1-backend.md`](docs/superpowers/plans/2026-03-25-phase1-backend.md)

---

## Tech Stack Summary

**Go 1.25** + **Next.js 15** + **Python 3.13** form the optimal stack for a real-time exchange simulator handling 100 orders/sec with WebSocket broadcasting. The critical architectural insight: at this throughput, your bottleneck is never raw framework performance — it's concurrency design. A single-goroutine actor pattern for the matching engine, RAF-batched WebSocket rendering on the frontend, and shared `aiohttp` sessions for Python bots eliminate the three most common failure modes.

---

## Build Phases

### **Phase 1 — Go Backend** ✅ Ready to implement
**Goal:** Matching engine + GBM market generator + WebSocket hub + HTTP API + Docker

**Deliverables:**
- BTree-based order book with price-time priority matching
- GBM generator emitting ~100 synthetic orders/sec
- WebSocket server broadcasting `book`, `trade`, `stats`, `portfolio`, `order_update` messages
- REST API: `POST /orders`, `DELETE /orders/{id}`, `GET /candles`, `GET /health`
- Dockerized backend with health checks

**Plan:** [`docs/superpowers/plans/2026-03-25-phase1-backend.md`](docs/superpowers/plans/2026-03-25-phase1-backend.md)

---

### **Phase 2 — Next.js Frontend** 🔜 After Phase 1
**Goal:** Hyperliquid-style trading terminal with 60fps real-time updates

**Deliverables:**
- TradingView Lightweight Charts v5 with 1s candles
- Three-view order book (Tab / Stacked / Large) with animated depth bars
- Live trade tape scrolling
- Order entry panel (Market / Limit)
- Portfolio widget with live P&L
- RAF-batched WebSocket hook (100 msgs/sec → 60fps)

**Scoring weight:** 50% — this is where the competition is won

---

### **Phase 3 — Python Bots** 🔜 After Phase 2
**Goal:** Market maker + alpha bot for tie-breaker points

**Deliverables:**
- **Market Maker Bot:** Avellaneda-Stoikov inventory-adjusted quotes
- **Alpha Bot:** MACD/RSI trend follower with NumPy-only indicators
- `aiohttp` async WebSocket connections

**Scoring weight:** 5% bonus

---

### **Phase 4 — Report** 📄 Final submission
**Goal:** Architecture & Quant Report (max 10 pages, PDF)

**Required sections:**
- System architecture diagram (GBM → engine → WebSocket → frontend)
- Matching engine design (data structures, price-time priority algorithm, complexity analysis)
- GBM model description (formula, parameters: S₀, μ, σ, tick rate, rationale)
- WebSocket message protocol (message types, throttling strategy)
- Performance analysis (orders/sec throughput, latency, frontend rendering strategy)
- Bot logic (Avellaneda-Stoikov MM + MACD/RSI alpha, if Phase 3 completed)

---

## Evaluation Breakdown (100 points)

| Criterion | Weight | How we win |
|-----------|--------|------------|
| **Frontend & UX** | 50% | Hyperliquid-quality terminal, animated depth bars, 60fps, 3 view modes, polished dark theme |
| **Backend & Architecture** | 20% | Single-goroutine actor, btree LOB, coder/websocket hub, 100 orders/sec sustained |
| **Code Quality & Deployment** | 20% | Clean module boundaries, distroless Docker, one `docker compose up` |
| **Quant & Bot Logic** | 5% bonus | Avellaneda-Stoikov MM + MACD/RSI alpha bot (Phase 3) |
| **Presentation** | 10% | 15-slide deck explaining the solution |

---

## Quick Start

```bash
# Check environment
go version           # Expected: go1.25.8
node --version       # Expected: v22.22.0
docker --version     # Expected: 29.3.0

# Phase 1: Build backend
cd backend
go mod init github.com/nextbull/trading-terminal
go get github.com/google/btree@v1.1.3
go get github.com/coder/websocket@latest
go get github.com/google/uuid@latest

# Follow the task-by-task plan:
# docs/superpowers/plans/2026-03-25-phase1-backend.md
```

---

## Technical Reference — Library Choices & Rationale

The sections below document the research behind our stack choices. This is reference material — the actual implementation follows the plan documents.

---

## Go backend: the matching engine core

**Go 1.24** (released February 2025, latest patch 1.24.13) is the battle-tested choice; **Go 1.25** (released August 2025, latest patch 1.25.8) adds container-aware `GOMAXPROCS`, an experimental Green Tea GC reducing overhead by **10–40%** in GC-heavy workloads, and `encoding/json/v2` behind `GOEXPERIMENT=jsonv2` for substantially faster JSON decoding. Go 1.24 brought Swiss Tables maps (2–3% CPU reduction), improved runtime mutexes, and the `tool` directive in `go.mod` replacing the `tools.go` hack. Either version works; Go 1.25 is recommended if you want the container-aware runtime and experimental GC.

For HTTP + WebSocket at 75–100 orders/sec, **skip Fiber and Echo — use `net/http` (stdlib) + `github.com/coder/websocket`**. Go 1.22+ added method-aware routing (`mux.HandleFunc("POST /orders", handler)`) and path wildcards (`{id}`), eliminating the primary reason for third-party routers. Fiber v3 runs on Fasthttp (incompatible with `net/http` middleware), and Echo v5 won't stabilize its API until after March 31, 2026. At 100 orders/sec, any Go HTTP server is idle most of the time — framework choice is irrelevant to performance.

**`coder/websocket`** (formerly nhooyr/websocket) is the clear WebSocket winner. Unlike gorilla/websocket (which panics on concurrent writes and is seeking maintainers), coder/websocket provides **safe concurrent writes**, full `context.Context` integration, and works natively with `http.Handler`. The `gobwas/ws` library's zero-allocation upgrade is overkill below 100k connections.

### Order book data structure

Use **`github.com/google/btree` v1.1.3** with its generic `BTreeG[T]` alongside a `map[string]*Order` for O(1) cancellations. The B-tree's flat node structure provides better CPU cache locality than red-black trees (`emirpasic/gods`) for iterating near best bid/ask. Key API methods: `ReplaceOrInsert`, `DeleteMin`/`DeleteMax` for best price access, and `AscendRange`/`DescendRange` for depth queries. The `Clone()` method uses copy-on-write semantics, enabling cheap snapshots for broadcasting. The canonical LOB structure maps directly:

- **Bids/Asks**: Two `BTreeG[PriceLevel]` trees (descending for bids, ascending for asks)
- **Orders**: `map[orderID]*Order` for O(1) cancel lookups
- **PriceLevel**: contains price, total volume, and a doubly-linked list of orders (FIFO time priority)
- Target complexities: Add O(log M), Cancel O(1), Execute O(1), where M = distinct price levels

### Single-goroutine actor pattern

The matching engine should run as a **single pinned goroutine** that owns all order book state. All inbound orders flow through a buffered channel; all results (trades, book updates) flow out through another channel. This eliminates mutexes on the hot path entirely — no `sync.RWMutex` needed for the matching core. The pattern is lock-free, deterministic (price-time priority requires sequential processing), and maximizes cache locality.

```
HTTP handlers → buffered chan Order → [single matching goroutine] → chan TradeResult → Hub
```

Reserve `sync.RWMutex` for read-heavy auxiliary access patterns (e.g., a REST endpoint querying current depth while the engine processes orders). For the WebSocket broadcast layer, use the **Hub pattern**: a single goroutine owns the client map, receives messages on a broadcast channel, and fans out to per-client buffered send channels. Each client has a dedicated `writePump` goroutine draining its send channel. Slow clients whose buffers fill get disconnected rather than blocking the broadcast — this is critical for a trading system.

**Pre-serialize broadcast messages once** as `[]byte` before sending to the hub. Never serialize per-client. Throttle order book snapshots to fixed intervals (e.g., 100ms) or use incremental deltas to avoid flooding clients.

### Docker and module patterns

Use multi-stage builds with `golang:1.25-alpine` for building and **`gcr.io/distroless/static-debian12:nonroot`** for runtime. Build flags: `CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w"` produces a fully static binary at ~8–15MB. Distroless includes CA certificates and timezone data with zero CVEs and no shell (reduced attack surface). The `go.mod` should set `go 1.25`, use the `tool` directive for dev tools (`golangci-lint`, `swag`), and the new `ignore` directive for non-Go directories.

---

## Next.js frontend: the trading terminal

**Next.js 15.x** remains the stable, widely-deployed option (App Router, React 19 support, Turbopack dev stable). **Next.js 16.1** (December 2025) makes Turbopack default for both dev and build, adds React Compiler 1.0 for auto-memoization, and renames middleware to "proxy" with Node.js runtime. For a real-time trading terminal, either version works — the trading page is entirely client-side.

The architecture: use **Server Components only for the outer shell** (layout, metadata, fonts) and mark the trading page as `'use client'` at the page level. All WebSocket-connected components live in client components. Use `dynamic(() => import('./TradingTerminal'), { ssr: false })` for canvas-dependent chart components.

### RAF-batched WebSocket hook

The single most important frontend pattern: **never call `setState` in a WebSocket `onmessage` handler**. Instead, write to a `useRef` buffer and flush once per frame via `requestAnimationFrame`:

```
WebSocket onmessage → bufferRef.current.push(msg) → RAF tick → single setState → React render
```

The `onmessage` handler writes to a plain array held in `useRef` (zero re-renders). A `requestAnimationFrame` loop reads that buffer at **60Hz** (or 120Hz on high-refresh displays), processes the batch into final state, calls `setState` once, and clears the buffer. React sees one update per frame regardless of message frequency. For ultra-high-frequency single values (last price ticker), bypass React entirely: `priceRef.current.textContent = newPrice` via DOM refs.

### TradingView Lightweight Charts v5.1.0

The **v5 API changed significantly**: series creation moved from `chart.addCandlestickSeries()` to `chart.addSeries(CandlestickSeries, options)`. The `setData()` method replaces all data (use for initial/historical load); the `update()` method adds or modifies a single bar in real-time — if the timestamp matches the last bar it updates OHLC values, if newer it appends. Bundle size is **35kB** (16% smaller than v4). New in v5: multi-pane support, data conflation for large datasets, expanded color support. Control the chart entirely via refs (`seriesRef.current?.update(candle)`) to avoid React re-renders on every tick.

### State management: Zustand v5

**Zustand v5.0.8** (~1KB) is the right choice over Jotai or Redux Toolkit for one reason: it's an **external store**. WebSocket handlers can call `useOrderBookStore.getState().updateOrderBook(bids, asks)` entirely outside React's render cycle. Selector-based subscriptions (`useTradingStore(s => s.bids)`) ensure only the order book component re-renders when bids change, not the chart or order entry panel. Combine with the RAF batching pattern: flush the WebSocket buffer into Zustand's `setState` at 60fps. Jotai's atoms live inside the React tree, making external updates from WebSocket handlers awkward. Redux Toolkit adds 15KB of bundle for no benefit here.

### Tailwind CSS v4.2.2

**Tailwind v4** (January 2025) eliminated `tailwind.config.js` entirely. Configuration is now CSS-first via `@import "tailwindcss"` and `@theme {}` blocks. No `postcss-import` or `autoprefixer` needed — built-in processing powered by Lightning CSS. Full builds are **5× faster**, incremental builds **100×+ faster**. For a dark trading terminal theme:

```css
@import "tailwindcss";
@theme {
  --color-bg-primary: #0e1117;
  --color-bg-panel: #1a1d29;
  --color-bull: #26a69a;
  --color-bear: #ef5350;
  --color-text-primary: #e0e0e0;
  --color-text-muted: #6b7280;
  --color-border: #1e222d;
}
```
---

## Python trading bots: async architecture

**Python 3.13.12** (February 2026) is the proven stable choice. Key features: experimental free-threaded mode (PEP 703) for true thread parallelism and a preliminary JIT compiler. No new async syntax — the ecosystem relies on mature `asyncio` with `TaskGroup` (Python 3.11+) for structured concurrency.

**`aiohttp` 3.13.3** is the clear winner for trading bots because it handles both REST API calls and WebSocket streams in a single `ClientSession`. `httpx` 0.28.1 has no native WebSocket support (requires the beta `httpx-ws` package). The `websockets` library (v16.0) is excellent for dedicated WebSocket-only connections but lacks the unified REST+WS session that trading bots need.

### Two bots, one session

Create a single `aiohttp.ClientSession` and pass it to both bot constructors. Each bot opens its own WebSocket connection within the shared session (connections are independent streams, pooled by the session). Run both bots concurrently with `asyncio.TaskGroup` (preferred over `asyncio.gather` for structured error handling):

```python
async with aiohttp.ClientSession() as session:
    async with asyncio.TaskGroup() as tg:
        tg.create_task(market_maker.run(session))
        tg.create_task(trend_follower.run(session))
```

### Avellaneda-Stoikov market making

The model produces **inventory-adjusted quotes** around a reservation price. Two core formulas:

- **Reservation price**: `r = s - q × γ × σ² × (T - t)` — shifts the midpoint away from accumulated inventory. When long (q > 0), the reservation price drops below mid, making the market maker eager to sell.
- **Optimal spread**: `δ = γ × σ² × (T - t) + (2/γ) × ln(1 + γ/k)` — balances profitability against fill probability. Bid = r - δ/2, Ask = r + δ/2.

Parameters: **γ** (gamma, risk aversion, 0.01–1.0), **σ** (volatility, e.g. 0.02 for 2% daily), **k** (order arrival intensity, higher = denser book), **T-t** (time remaining in session). For continuous simulated markets, use rolling time windows (e.g., T=3600 seconds, resetting periodically) rather than a fixed session end. Estimate σ from a rolling standard deviation of recent returns.

### Lightweight technical indicators

Implement EMA, MACD, and RSI in pure NumPy without pandas. The EMA uses the recursive formula `result[i] = α × price[i] + (1-α) × result[i-1]` where `α = 2/(period+1)`. MACD is simply `EMA(12) - EMA(26)` with a 9-period signal line. RSI uses Wilder's smoothing: compute average gains and losses over 14 periods, then `RSI = 100 - 100/(1 + avg_gain/avg_loss)`. The EMA crossover detector tracks when `fast_ema[i] - slow_ema[i]` changes sign between consecutive ticks. All implementations are vectorizable with NumPy and dependency-free beyond the NumPy requirement.

Use **`pyproject.toml`** (PEP 621) as the single source of truth for project metadata and dependencies. Key dependencies: `aiohttp>=3.13.0`, `numpy>=2.0`, `orjson>=3.10` (fast JSON parsing for market data). Generate a pinned `requirements.lock` with `pip-compile` for reproducible Docker builds.

---

## Infrastructure: Docker Compose orchestration

**Docker Compose CLI v5.1.0** (February 2026) is the latest. The version jump from v2.x to v5.x was intentional to avoid confusion with legacy file format versions. The `version` field in compose files is **obsolete — omit it entirely**. Use `compose.yaml` (not `docker-compose.yml`).

### Service startup ordering

The Go backend must start and pass health checks before Python bots or the Next.js frontend connect. Use `depends_on` with `condition: service_healthy`:

```yaml
services:
  backend:
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
  python-bot:
    depends_on:
      backend:
        condition: service_healthy
        restart: true    # restart bot if backend restarts
  frontend:
    depends_on:
      backend:
        condition: service_healthy
```

Use `wget` rather than `curl` in health checks — it's available in Alpine images and distroless doesn't have either (for distroless, compile a tiny Go health check binary into the image). The Go health endpoint should use an `atomic.Bool` flag set to `true` only after the matching engine is initialized and ready.

### Multi-stage builds produce dramatic size reductions

- **Go**: `golang:1.25-alpine` → `gcr.io/distroless/static-debian12:nonroot` — final image **~10–15MB** (98% reduction)
- **Python**: `python:3.13` → `python:3.13-slim` with pre-built wheels — final image **~180MB** (82% reduction)
- **Next.js**: `node:22-alpine` with `output: 'standalone'` in next.config — final image **~110MB** (85% reduction), copying only `.next/standalone` and `.next/static`

### Environment and networking

Services communicate via Docker's internal DNS using service names as hostnames: `http://backend:8080` from Python bots, `ws://backend:8080/ws` from any internal service. The browser-facing Next.js client needs host-accessible URLs (`http://localhost:8080`), so maintain two URL sets: `BACKEND_URL` for internal service-to-service and `NEXT_PUBLIC_API_URL` for client-side. Store all configuration in `.env` (auto-loaded by Compose), commit a `.env.example` with dummy values, and use `--env-file .env.production` for deployment overrides.

For development, use `docker compose watch` (modern) or volume mounts with **Air** (`github.com/air-verse/air`) for Go hot reload, `watchfiles` for Python auto-restart, and Next.js's built-in HMR. Separate dev and production compose files (`compose.yaml` for production, `compose.dev.yaml` for development with volume mounts and debug ports).

---

## Conclusion

The recommended stack crystallizes around a few non-obvious decisions. **Standard library net/http beats Fiber and Echo** at this throughput — framework overhead is noise at 100 orders/sec, but ecosystem compatibility is permanent. **The single-goroutine actor pattern** for the matching engine is more important than any data structure choice — it eliminates an entire class of concurrency bugs while being faster than mutex-based designs. On the frontend, **RAF batching is the make-or-break pattern** — without it, 100 WebSocket messages/sec will freeze React; with it, the UI stays smooth at 60fps regardless of message rate. And **Zustand's external store model** is specifically what makes it superior to Jotai for trading UIs — the ability to update state from a WebSocket handler outside the React tree is not a nice-to-have, it's architecturally essential.

The full version matrix: **Go 1.24/1.25**, **coder/websocket** (latest), **google/btree v1.1.3**, **Next.js 15.x or 16.x**, **Lightweight Charts v5.1.0**, **Zustand v5.0.8**, **Tailwind CSS v4.2.2**, **Python 3.13.12**, **aiohttp 3.13.3**, **Docker Compose v5.1.0**.