# NEXTBULL UI

Next.js 15 frontend for the NEXTBULL trading terminal. Hyperliquid-inspired layout with full micro-animation treatment.

## Quick Start

```bash
# From repository root (recommended — uses compose.yaml)
docker compose up --build

# Local dev
cd ui
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`. Expects backend on `http://localhost:8080`.

## Quality Checks

```bash
npm run test    # Vitest unit tests
npm run lint    # ESLint
npm run build   # Next.js production build
```

---

## Architecture

### State — `store/tradingStore.ts`

Single Zustand store for all live market state. Key slices:

| Slice | Type | Description |
|-------|------|-------------|
| `orderBook` | `OrderBookMsg` | Top 20 bids/asks |
| `trades` | `TradeMsg[]` | Trade tape (capped at 100) |
| `stats` | `StatsMsg` | Session OHLCV, VWAP, change % |
| `portfolio` | `PortfolioMsg` | Human cash, holdings, P&L |
| `openOrders` | `OrderUpdateMsg[]` | Active human orders |
| `equityHistory` | `EquityPoint[]` | Human equity curve (capped at 600) |
| `botPortfolios` | `Map<string, PortfolioMsg>` | `market_maker` and `alpha_bot` portfolios |
| `botEquityHistory` | `Map<string, EquityPoint[]>` | Per-bot equity curves (capped at 600 each) |
| `candles` | `CandleData[]` | 1 s OHLCV candles |

**Hot path rule:** price tickers and order book updates use DOM refs (`useRef`) and direct DOM mutation — never `setState`. Avoids React re-render on every WebSocket tick.

### WebSocket — `hooks/useWebSocket.ts`

Single persistent connection. Reconnects automatically on close. Handles two message categories:

1. **`snapshot`** (on connect) — bulk-sets all initial state in one store update
2. **Live messages** — routed by `type`:
   - `book` → `setOrderBook`
   - `trade` → `addTrade`
   - `stats` → `setStats` + DOM-ref ticker updates
   - `order_update` → `updateOrder`
   - `portfolio` — **routed by `user_id`**:
     - `user_id === "human"` (or absent) → `setPortfolio`
     - anything else → `setBotPortfolio` (feeds bot observability UI)

### Types — `types/ws.ts`

All WebSocket message shapes as TypeScript types. Key types:

- `SnapshotMsg` — full initial state on connect
- `OrderBookMsg` — `bids`/`asks` as `[price, size][]`
- `PortfolioMsg` — includes `user_id`, `recent_fills`, `fill_count`
- `BotFill` — `{ts, price, side, size}` — bot fill records
- `WsFillRecord` — same shape, used for human fills
- `EquityPoint` — `{ts, value}`

---

## Component Map

```
components/
├── Header/
│   ├── AssetBar.tsx        Ticker strip — live price, change %, OHLCV stats + BotButton
│   └── ...
├── OrderBook/              Depth visualization with animated pressure bars
├── Chart/                  TradingView Lightweight Charts — candlestick + equity curve
├── OrderEntry/             Limit/market order form with cash validation
├── Portfolio/              Human P&L panel — cash, holdings, unrealized/realized PnL
├── MarketPanel/            Trade tape — scrolling recent executions
├── Bots/
│   ├── BotButton.tsx       Header button — green dot when both bots active
│   ├── BotDropdown.tsx     Quick-view panel — side-by-side bot stats with equity flash
│   ├── BotModal.tsx        Full overlay — equity curves + fill tables for both bots
│   └── BotEquityCurve.tsx  Lightweight Charts LineSeries, subscribes via store.subscribe
├── CommandPalette/         Keyboard-driven command palette
├── Toast/                  Notification system
└── Workbench/              Main panel layout — positions all trading panels
```

### Bot Observability UI

The **Bots** components surface the Market Maker and Alpha Bot live state:

- **`BotButton`** lives in `AssetBar`. Shows a green activity dot when both `market_maker` and `alpha_bot` portfolios have arrived via WebSocket.
- **`BotDropdown`** opens on click — side-by-side stat cards with equity flash animation, realized/unrealized P&L, fill count. "Expand" button opens the full modal.
- **`BotModal`** full-screen overlay — two `BotColumn` blocks, each with:
  - `BotEquityCurve` — live equity chart (indigo for Market Maker, amber for Alpha Bot)
  - 4 stat chips: Cash, Holdings, Realized P&L, Unrealized P&L
  - Fills table — last 15 fills in reverse chronological order

**`BotEquityCurve` re-render note:** subscribes via `useTradingStore.subscribe` (not `useEffect` with selector). This means chart updates bypass React's render cycle entirely — the chart series is updated directly via Lightweight Charts API.

**Bot colors:**
- Market Maker: `#6366f1` (indigo)
- Alpha Bot: `#f59e0b` (amber)

---

## Design System

Theme and tokens are locked — do not change these:

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#0e1117` | Page background |
| Panel | `#1a1d29` | All panel backgrounds |
| Border | `#1e222d` | Panel dividers |
| Bull / bid | `#26a69a` | Buy prices, positive P&L |
| Bear / ask | `#ef5350` | Sell prices, negative P&L |
| Brand gold | `oklch(75% 0.13 68)` ≈ `#c8972a` | NEXTBULL wordmark only — never near price data |

Typography: `Plus Jakarta Sans` for UI chrome, `JetBrains Mono` for all prices and numeric data.

---

## Environment Variables

Defined in repository-level `.env` (copied from `.env.example`):

| Variable | Default | Usage |
|----------|---------|-------|
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8080/ws` | WebSocket URL (browser) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | REST URL (browser) |
| `FRONTEND_PORT` | `3000` | Container port |
| `BACKEND_INTERNAL_URL` | `http://backend:8080` | Server-side fetch (Docker internal DNS) |
