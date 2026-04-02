# Presentation Content — OS2026-XX
## OpenSoft 2026 · IIT Kharagpur

**13 slides · 12-minute window (presentation + live demo)**

**PPT team notes:**
- Dark terminal theme throughout — background `#0e1117`, panel fills `#1a1d29`
- Trade colors: teal `#26a69a` for buy/positive, red `#ef5350` for sell/negative
- Gold `#c8972a` accent only on slide 1 — never near price data
- Bot colors: Market Maker indigo `#6366f1`, Alpha Bot amber `#f59e0b`
- Fonts: Plus Jakarta Sans or Inter for headings, JetBrains Mono for any code or numbers
- Every slide: one main message, enough white space to breathe
- Screenshots: take from a live running instance — the actual terminal, not mockups

---

## SLIDE 1 — Title

**Objective:** Satisfy the competition rule. Nothing else.

### On-slide content
```
OS2026-XX
```
Thin gold rule below the code.

**Presenter script:** *(Silent — move immediately to slide 2.)*

**Visual:** Full bleed `#0e1117`. Team code large, centered, white monospace. Nothing else on the slide.

**Time:** 5s

---

## SLIDE 2 — What We Built

**Objective:** Land the scope and the headline numbers before showing anything. Make judges sit up.

### On-slide content

> *"A complete exchange — matching engine, synthetic market, and live trading terminal — built entirely from scratch. No external data. No CSV files. The market generates itself."*

**By the numbers:**

|                   |                                                        |
| ----------------- | ------------------------------------------------------ |
| `200`             | synthetic orders per second — 4× the spec requirement  |
| `single-digit ms` | WebSocket round-trip latency in local run              |
| `3`               | isolated portfolios competing on one shared order book |
| `$100,000`        | starting capital per participant                       |
| `1`               | command to launch the entire system                    |

**Presenter script:**
The problem statement asked for 50 to 100 orders per second. We're running at 200 — and that's a configured limit, not a hardware ceiling.
Everything in this system — the price, the liquidity, the trades — is generated locally on startup with zero external dependencies.
One command launches the matching engine, the market generator, two live trading bots, and the full web terminal.

**Visual:** Dark slide. Quote at top. The five-row number table below — make the numbers (`200`, `single-digit ms`, `3`, `$100,000`, `1`) large and in teal/gold, the descriptions in smaller muted text. High contrast, instantly scannable.

**Time:** 35s

---

## SLIDE 3 — System Architecture

**Objective:** Show how all components connect in one diagram. Don't explain — show.

### On-slide content

```
  GBM Generator  ──┐
  Market Maker   ──┼──► inChan ──► Matching Engine ──► WebSocket Hub ──► Browser
  Alpha Bot      ──┤                      │
  Human (HTTP)   ──┘                      ▼
                                  Portfolio Registry
                              (human / MM / alpha_bot)
```

Four annotations on the diagram:
- `inChan` — single shared channel, 1024-item buffer
- Matching Engine — single goroutine, price-time priority, no mutex on hot path
- Portfolio Registry — 3 isolated $100k accounts
- WebSocket Hub — live book, trades, stats, P&L to all clients

**Presenter script:**
Four order sources. One channel. One matcher.
The matching engine is intentionally single-threaded — deterministic ordering, zero lock contention on the path that actually matters.
Everything that happens flows out through the WebSocket hub: the order book, every trade, portfolio updates, live stats.

**Visual:** Dark background. Box nodes with `#1a1d29` fill, `#1e222d` border. Light gray arrows. Color the four inputs: GBM gray, Market Maker indigo, Alpha Bot amber, Human teal. Tight layout — annotations only, no extra prose on the slide.

**Time:** 45s

---

## SLIDE 4 — The Matching Engine

**Objective:** Establish correctness and the core design decision.

### On-slide content

**Three order types:**
| Type   | Behavior                                      |
| ------ | --------------------------------------------- |
| Limit  | Rests in the book; matches when price crosses |
| Market | Sweeps immediately; never rests               |
| Cancel | Removes a resting order by ID                 |

**Price-time priority:** At any given price level, the earlier order fills first. Always.

**The key decision:**
Single goroutine — no race conditions, no mutex on the matching loop.
Correct fill order is guaranteed, not just probable.

**Presenter script:**
Three order types, strict price-time priority. The rule is simple: first in at a price level, first out.
It's single-threaded by design. That might sound like a constraint — it's actually a correctness guarantee. Fill order is deterministic, not dependent on scheduling.
The only lock in the hot path is on depth snapshots, which come from the HTTP layer, not from matching.

**Visual:** Left — the three-row table. Right — a clean bid/ask ladder diagram with a trade crossing through the spread, small arrow annotations showing which order fills first at the crossed level.

**Time:** 40s

---

## SLIDE 5 — The Synthetic Market

**Objective:** Show the math and the tuning. Make it clear this is rigorous, not random.

### On-slide content

**GBM price model:**
```
S(t) = S₀ · exp( (μ − σ²/2)·t  +  σ·√t·Z )

S₀ = 100     μ = 0.0 (no drift — fair market)     σ = 0.015     Z ~ N(0,1)
```

**Message mix at 200/sec:**
```
~170 limit orders  (85%)   — populate and deepen the book
 ~20 cancel orders (10%)   — simulate natural order withdrawal
 ~10 market orders  (5%)   — create immediate price impact
```

**Soft anchor — the realism detail:**
```
anchor = 0.995 × anchor + 0.005 × price
price  = price × exp(−0.08 × distance × dt)
```
Without this: price drifts to $400 and never comes back.
With this: realistic oscillation that looks like a real market in a demo window.

**Presenter script:**
GBM ticks every 10ms. Each tick generates a new price and from that price, a mix of limit orders, cancels, and market orders flows into the matching engine.
The soft anchor is what separates a realistic-looking market from a random walk. It lets the price move freely but pulls it back if it runs too far — the kind of mean-reversion you'd see in a real low-volatility asset.
200 messages per second is the configured rate. It's one environment variable — `GBM_TARGET_MSGS_PER_SEC`. Bump it and the architecture handles it.

**Visual:** Formula large and clean on the left. Right — a screenshot of the candlestick chart showing realistic oscillating price action with visible swing highs and lows. Small annotation on the chart: *"Generated locally on startup."* The message mix as a small horizontal bar: 85% teal / 10% gray / 5% red.

**Time:** 45s

---

## SLIDE 6 — Built for Throughput

**Objective:** This is the slide that impresses. Show the system capacity, the design headroom, and what the frontend does to stay smooth.

### On-slide content

**The PS asked for ≥50 msgs/sec. Here's where we actually sit:**

```
                      Spec floor          Our config         Scalable headroom
                     ─────────────       ────────────       ─────────────────
 Synthetic flow       50–100/sec    →      200/sec      →    configurable via env
                                                             with frontend RAF batching
```

**Why the ceiling is high:**
- Matching engine: pure in-memory Go — no I/O, no disk, no network on the hot path
- `inChan` buffer absorbs burst spikes without dropping orders
- WebSocket hub: non-blocking send — slow clients get disconnected, fast clients never stall
- Frontend: RAF batching collapses book frames — UI stays at 60fps regardless of how many arrive per second

**Live performance (visible in header during demo):**
```
WS latency     single-digit ms (local run)
Throughput     live msgs/s shown in header during demo
```

**Presenter script:**
The spec floor was 50 to 100 messages per second. We're running at 200, and that number is a throttle — change one environment variable and the system will handle significantly more.
The matching engine is pure in-memory Go. No I/O, no disk, no network inside the hot path. Orders are processed in microseconds.
On the frontend, requestAnimationFrame batching means the UI doesn't care whether 200 or 2000 messages arrive per second — it collapses them to 60 frames and renders what's relevant. The latency and throughput numbers you'll see in the header are live.

**Visual:** The three-column comparison table (`Spec / Our config / Headroom`) as the hero element — make the "200/sec" and the headroom statement visually prominent. Below it, the four bullet points on why scaling headroom exists. Bottom — a screenshot of the header strip showing live WS stats. This slide should feel sharp and credible, not over-claimed.

**Time:** 45s

---

## SLIDE 7 — The Trading Terminal

**Objective:** Let the product speak. This is the highest-weighted judging criterion — 50% of marks.

### On-slide content

*(This slide is primarily the terminal screenshot — minimal text overlay)*

**Panel labels annotated on screenshot:**
- **Chart** — candlestick, 6 timeframes, VWAP overlay, fill markers on every trade, fullscreen mode
- **Order Book** — fixed price ladder, depth bars animate on each update, 3 layout modes
- **Order Entry** — limit + market, slippage estimate, keyboard shortcuts, quick-size buttons
- **Portfolio** — live cash, position, P&L in teal/red
- **Workbench** — Orders / Portfolio / Performance tabs

**Callout strip at bottom:**
`B` buy · `S` sell · `Enter` submit · `Cmd+K` command palette · click any book price to fill

**Presenter script:**
This is what 50% of the evaluation comes down to — how the terminal actually feels to use.
Six timeframes, all aggregated client-side from raw 1-second candles. VWAP line, fill markers on every trade your account executes.
The order book depth bars animate on every update. Click any price level and it populates the order form instantly.
It's designed to feel like a real trading desk. Every action has a keyboard shortcut.

**Visual:** Near-full-slide screenshot of the live terminal. Annotate the five panels with short, minimal labels. Keep text overlay to an absolute minimum — the product is the content here.

**Time:** 60s

---

## SLIDE 8 — Order Entry & Interaction

**Objective:** Show the human trading experience — form, validation, the full feedback loop.

### On-slide content

**Two order types:**
- **Limit** — price + size, rests in the book until filled or cancelled
- **Market** — size only; estimated average fill price and slippage shown before you submit

**What the system checks before submission:**
- Limit buy: `price × size ≤ available cash` — validated client-side before the request leaves
- Short selling: fully supported — holdings go negative, P&L tracks the short correctly end-to-end

**What happens the moment you submit:**
```
→ Toast: filled / partially filled / rejected
→ Open Orders tab: order appears with live status
→ On fill: portfolio numbers update + fill marker placed on chart
→ Sound feedback on execution (mutable)
```

**Presenter script:**
For market orders, the slippage estimate is calculated live from the current order book — you see the expected average fill price before you confirm.
Cash validation happens on the client, not just the server. You can't accidentally submit an order that would fail.
Short selling is first-class. You can sell more than you hold, and the P&L — average entry, unrealized, realized — tracks the position correctly through the entire lifecycle.

**Visual:** Zoomed-in screenshot of the Order Entry panel with Market type selected and slippage estimate visible. Two small annotations: *"Estimated from live book"* and *"Validated before submission."*

**Time:** 35s

---

## SLIDE 9 — Keyboard-First Trading

**Objective:** Show the command palette and shortcuts as a differentiator — this is what separates a terminal from a form.

### On-slide content

**Every action has a key:**

| Key             | Action                                     |
| --------------- | ------------------------------------------ |
| `B`             | Switch to Buy side                         |
| `S`             | Switch to Sell side                        |
| `Enter`         | Submit the order                           |
| `Escape`        | Blur input / reset form                    |
| `1` `2` `3` `4` | Quick-size buttons (0.5 / 1 / 2 / 5 units) |
| `?`             | Open help modal                            |
| `Cmd+K`         | Open command palette                       |

**Command palette (`Cmd+K`):**
- Search and execute any terminal action by name
- Switch timeframes, change order book layout, toggle fullscreen, place orders — all without touching the mouse
- Keyboard navigation throughout: arrow keys, Enter to confirm, Escape to close

**No mouse required to trade.** Open the terminal, press `B`, type a size, hit `Enter`. Done.

**Presenter script:**
You never have to reach for the mouse.
Every action in the terminal has a keyboard shortcut — switch sides, set size, submit. The full trade cycle is B, type size, Enter.
Cmd+K opens the command palette: search any action by name and execute it. Change the chart timeframe, switch the order book layout, place an order — all from the keyboard.
This isn't just a nice-to-have. It's what makes the terminal feel like a professional tool rather than a web form.

**Visual:** Two elements side by side. Left — the shortcut table, clean and readable. Right — a screenshot of the command palette open (the dark overlay with the search input and action list). The palette screenshot should show a few actions listed. Make the `Cmd+K` key combination visually prominent — large, bold, on a key-cap styled element.

**Time:** 35s

---

## SLIDE 10 — Portfolio & P&L

**Objective:** Show that portfolio math is correct, live, and covers edge cases.

### On-slide content

**Tracked in real time, per account:**
```
cash          →  available buying power
holdings      →  current position (negative = short)
avg_entry     →  cost basis
unrealized    →  (price − avg_entry) × holdings
realized      →  locked-in P&L from closed trades
equity        →  cash + holdings × last_price
```

**Retained history:**
- 600-point equity curve → charted live in the Performance tab
- 200 fill records per account → used as chart markers and fill history

**Presenter script:**
Every fill updates all six numbers in real time — no polling, it arrives over WebSocket.
Short positions work correctly: negative holdings, reversed P&L, clean position close.
The equity curve is charted live using the same library as the candlestick chart — you can watch the portfolio value move tick by tick.

**Visual:** Left — Portfolio tab screenshot showing cash/holdings/P&L numbers (teal for positive, red for negative). Right — equity curve screenshot from the Performance tab showing live curve shape. Clean layout, no prose.

**Time:** 30s

---

## SLIDE 11 — Trading Bots

**Objective:** Cover both strategies clearly and compactly. Bonus marks — high signal, low time.

### On-slide content

**Market Maker** *(indigo — `#6366f1`)*
```
Every 500ms:
  Cancel previous quotes
  bid = mid − 0.15 − (λ × inventory)
  ask = mid + 0.15 + (λ × inventory)
  Place new bid + ask

λ = 0.0002 · quote size = 10 units · max position = ±500
```
If the MM is long → ask moves in → easier to sell → inventory self-corrects.

**Alpha Bot** *(amber — `#f59e0b`)*
```
On each 1s candle (35 candle warmup):
  fast = EMA(9)    slow = EMA(21)    rsi = RSI(14)

  BUY   if  fast > slow  AND  rsi ≥ 52
  SELL  if  fast < slow  AND  rsi ≤ 48

50 units per trade · max position = ±200
```
EMA crossover confirms direction. RSI gate above/below 50 confirms momentum.
Dead band 48–52 prevents whipsawing on flat markets.

**Presenter script:**
Market Maker quotes continuously on both sides and skews its quotes based on inventory — a long position makes selling cheaper and buying more expensive, which naturally unwinds the risk.
Alpha Bot is directional: trend from the EMA crossover, momentum confirmation from RSI. Both have to agree before it fires.
They both compete on the same order book as the human, with their own $100,000 accounts. You'll see their equity curves in the next slide.

**Visual:** Two-column layout. Left column indigo-tinted card — MM formula. Right column amber-tinted card — Alpha Bot formula with a small price chart showing EMA(9) and EMA(21) lines crossing, RSI panel below with 52/48 bands marked. Match terminal bot colors exactly.

**Time:** 45s

---

## SLIDE 12 — Bot Observability

**Objective:** Show the bots aren't invisible — you can watch them trade live.

### On-slide content

**Three levels of live visibility:**

`Header dot` — green when both bots are active and sending portfolio updates

`Quick dropdown` — side-by-side stat cards on click: Cash · Holdings · Realized P&L · Unrealized P&L · fill count

`Full modal` — live equity curve per bot + last 15 fills (side, price, size, time) + 4 stat chips per bot

**Implementation detail worth noting:**
Bot equity curves call the Lightweight Charts API directly — no React re-render.
The chart updates as fast as WebSocket messages arrive, with no UI jank.

**Presenter script:**
The bots aren't black boxes. Click the Bots button and you get live equity curves, fill-by-fill history, and P&L for both running simultaneously.
Updates don't go through React — the chart series is called directly so it stays smooth regardless of how frequently the bot portfolios update.
In the demo, you'll be able to watch the Market Maker and Alpha Bot making independent decisions, in real time, on the same book you're trading on.

**Visual:** Full screenshot of the BotModal — both columns visible with equity curves, stat chips, fills table. Indigo curve for MM, amber for Alpha. Brief labels for each section. Let the screenshot do the work.

**Time:** 30s

---

## SLIDE 13 — Engineering Credibility

**Objective:** Signal code quality and deployment readiness in one tight slide. What judges actually care about.

### On-slide content

**Tested where it matters:**
- Matching: price-time priority, partial fills, cancel ownership, maker lifecycle
- Portfolio: long/short P&L, position reversal, equity curve accumulation
- Bots: alpha signal triggers, cash guards, position cap enforcement
- GBM: target throughput, correct flow ratio between order types

**One command to run everything:**
```bash
docker-compose up --build
```
Go backend: multi-stage build → distroless runtime image, non-root user, minimal footprint.
Frontend `:3000` · Backend `:8080` · All config via `.env`

**Clean separation (high-level):**
- Matching engine, strategy logic, synthetic market generation, and streaming are isolated modules.
- Component boundaries are enforced so strategy changes do not require matcher changes.

**Presenter script:**
Test coverage on the pieces that have to be correct: fill ordering, P&L math, bot signal conditions.
Deployment is one command. The backend runtime image is distroless — the binary and nothing else.
Each package has one job and no knowledge of the others. You can replace the Alpha Bot strategy without touching anything in the matching engine.

**Visual:** Three sections on one slide — Tested / Deployed / Separated. Keep each section to short bullets; no repository tree block. `docker-compose up --build` in a compact terminal code block. Everything visible without scrolling.

**Time:** 35s

---

## SLIDE 14 — Live Demo

**Objective:** Backdrop for the live demo. Near-empty — the terminal is the slide.

### On-slide content

```
LIVE DEMO
```
Below in small mono:
```
localhost:3000
```
Footer:
```
docker-compose up --build
```

**Demo sequence (follow this order):**
1. Terminal loaded — "Market Open" animation, price ticking live in header
2. Point to header: WS latency + msgs/s + OPEN status — use the live values on that machine
3. Place a **limit buy** — watch it appear in Open Orders, fill when hit
4. Place a **market sell** — immediate execution, P&L updates, fill marker on chart
5. Open **Bots panel** — both equity curves updating live, show fills coming in
6. Switch chart to **5m timeframe** — client-side candle aggregation, same data
7. Switch order book to **large mode** — side-by-side book and trades layout

**Presenter script:**
*(No script — describe naturally what you're doing as you do it. The product speaks.)*

**Visual:** "LIVE DEMO" large, centered, white. Everything else tiny. The terminal window is the content.

**Time:** ~180s (3 minutes)

---

## Timing Table

| #   | Slide                     | Time         |
| --- | ------------------------- | ------------ |
| 1   | Title                     | 5s           |
| 2   | What We Built             | 35s          |
| 3   | System Architecture       | 45s          |
| 4   | The Matching Engine       | 40s          |
| 5   | The Synthetic Market      | 45s          |
| 6   | Built for Throughput      | 45s          |
| 7   | The Trading Terminal      | 60s          |
| 8   | Order Entry & Interaction | 35s          |
| 9   | Keyboard-First Trading    | 35s          |
| 10  | Portfolio & P&L           | 30s          |
| 11  | Trading Bots              | 45s          |
| 12  | Bot Observability         | 30s          |
| 13  | Engineering Credibility   | 35s          |
| 14  | Live Demo                 | 180s         |
|     | **Total**                 | **~10m 25s** |

~2 minutes of buffer for natural pace and judge interruptions (interruption time not counted per competition rules).

