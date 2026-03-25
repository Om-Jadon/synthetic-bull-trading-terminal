# NEXTBULL Trading Terminal — Claude Context

## Design Context

### Users
Competition judges from IIT Kharagpur evaluating OpenSoft 2026 submissions. They open the terminal expecting a working trading UI — the goal is to stop them in their tracks. Secondary audience: developers who will demo the system live. Context: dark environment, desktop browser, full-screen. They understand trading UIs (Binance, Hyperliquid, etc.) and will immediately recognize quality or its absence.

### Brand Personality
**Precise. Alive. Premium.**

The terminal should feel like a real production trading desk — not a student project, not a tutorial clone. Every data point should feel like it matters. The market should feel like it's breathing. The UI chrome should disappear, leaving only the data.

### Aesthetic Direction
- **Base**: Hyperliquid-inspired layout, replicated faithfully per spec (Section 5.2 of design doc)
- **Elevation**: Full impeccable micro-animation treatment — price flashes, P&L changes, trade tape row entrances, depth bar pressure visualization, order submission feedback, staggered panel load-in
- **Theme**: Dark mode only. Background `#0e1117`, panels `#1a1d29`, borders `#1e222d`
- **Trade colors**: `#26a69a` (bull/teal), `#ef5350` (bear/red) — locked in, match Hyperliquid
- **Brand accent**: Restrained **amber/gold** `oklch(75% 0.13 68)` (~`#c8972a`) — ONLY for NEXTBULL wordmark and logo. Never near price/trade data.
- **Typography**: `Plus Jakarta Sans` (labels, headings, UI chrome) + `JetBrains Mono` (prices, sizes, P&L numbers)
- **Anti-references**: Generic crypto dashboards with cyan glows, gradient text, TailAdmin/shadcn clones

### Design Principles
1. **Data is the hero** — UI chrome is invisible; every decorative element serves the data
2. **Motion conveys meaning** — animations communicate state changes, not decoration
3. **Precision at every scale** — monospace numbers, tight row spacing, density feels intentional
4. **Brand without noise** — NEXTBULL gold appears only in the header wordmark, never near trade signals
5. **60fps or nothing** — RAF-batched WebSocket, DOM ref updates for price tickers, zero setState in hot path
