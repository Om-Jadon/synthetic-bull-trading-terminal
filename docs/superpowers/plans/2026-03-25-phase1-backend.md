# NEXTBULL Phase 1 — Go Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully working Go backend — matching engine, GBM market generator, WebSocket hub, HTTP API, and Docker — that broadcasts 100 orders/sec to connected clients.

**Architecture:** Single-goroutine actor pattern: all orders (human + GBM) flow through a buffered channel into a single matching goroutine that owns all order book state with no mutexes. Results fan out to a WebSocket hub that pre-serializes messages once and broadcasts to all clients via per-client buffered channels.

**Tech Stack:** Go 1.25, `github.com/google/btree` v1.1.3, `github.com/coder/websocket`, `encoding/json` stdlib, `net/http` stdlib, distroless Docker.

---

## File Map

```
backend/
├── cmd/server/main.go              # Wires all components, starts goroutines
├── internal/
│   ├── engine/
│   │   ├── types.go                # Order, Trade, PriceLevel, Event types
│   │   ├── orderbook.go            # BTreeG-based LOB, O(1) cancel
│   │   ├── orderbook_test.go       # Insert, best bid/ask, cancel, depth tests
│   │   ├── matcher.go              # Price-time matching, runs as single goroutine
│   │   ├── matcher_test.go         # Limit/market/cancel, partial fills, price-time priority
│   │   └── candles.go              # Ring buffer of 1s OHLCV candles + stats
│   ├── generator/
│   │   └── gbm.go                  # GBM price process, emits limit orders every 10ms
│   ├── hub/
│   │   └── hub.go                  # WebSocket hub, broadcast goroutine, per-client writePump
│   └── api/
│       └── handlers.go             # HTTP handlers: POST /orders, DELETE /orders/{id}, GET /candles, GET /health, GET /ws
├── go.mod
├── go.sum
├── Dockerfile
├── .env.example
└── compose.yaml                    # backend service only (frontend added in Phase 2)
```

---

## Task 1: Initialize Go Module and Install Dependencies

**Files:**
- Create: `backend/go.mod`

- [ ] **Step 1: Create backend directory and initialize module**

```bash
mkdir -p backend && cd backend
go mod init github.com/nextbull/trading-terminal
```

- [ ] **Step 2: Add dependencies**

```bash
go get github.com/google/btree@v1.1.3
go get github.com/coder/websocket@latest
go get github.com/google/uuid@latest
```

- [ ] **Step 3: Verify go.mod looks correct**

`backend/go.mod` should have:
```
module github.com/nextbull/trading-terminal

go 1.25

require (
    github.com/coder/websocket v1.8.x
    github.com/google/btree v1.1.3
    github.com/google/uuid v1.x.x
)
```

- [ ] **Step 4: Create directory structure**

```bash
mkdir -p cmd/server internal/engine internal/generator internal/hub internal/api
```

- [ ] **Step 5: Commit**

```bash
git add go.mod go.sum
git commit -m "feat: initialize Go module with dependencies"
```

---

## Task 2: Define Core Types

**Files:**
- Create: `backend/internal/engine/types.go`

- [ ] **Step 1: Write types.go**

```go
package engine

import "time"

type Side string

const (
    Buy  Side = "buy"
    Sell Side = "sell"
)

type OrderType string

const (
    TypeLimit  OrderType = "limit"
    TypeMarket OrderType = "market"
    TypeCancel OrderType = "cancel"
)

// Order represents any inbound order message
type Order struct {
    ID        string
    Type      OrderType
    Side      Side
    Price     float64 // 0 for market orders
    Size      float64
    Remaining float64
    UserID    string // "system" for GBM orders, "human" for human orders
    CreatedAt time.Time
}

// LevelOrder is a node in the FIFO doubly-linked list within a PriceLevel
type LevelOrder struct {
    Order *Order
    Prev  *LevelOrder
    Next  *LevelOrder
}

// PriceLevel holds all resting orders at a single price
type PriceLevel struct {
    Price  float64
    Volume float64 // sum of all Remaining sizes at this level
    Head   *LevelOrder
    Tail   *LevelOrder
}

// Trade is emitted when a match occurs
type Trade struct {
    ID            string
    Price         float64
    Size          float64
    BuyOrderID    string
    SellOrderID   string
    AggressorSide Side  // taker side — used for trade tape color
    HumanInvolved bool  // true if either party is the human user
    HumanIsBuyer  bool  // true if human is the buyer side
    Ts            int64 // Unix milliseconds
}

// OrderStatus values for order_update messages
const (
    StatusOpen      = "open"
    StatusPartial   = "partial"
    StatusFilled    = "filled"
    StatusCancelled = "cancelled"
)

// OrderUpdate is sent to human users when their order state changes
type OrderUpdate struct {
    OrderID       string  `json:"order_id"`
    Status        string  `json:"status"`
    FilledSize    float64 `json:"filled_size"`
    RemainingSize float64 `json:"remaining_size"`
    Price         float64 `json:"price"`
    Side          Side    `json:"side"`
    Ts            int64   `json:"ts"`
}

// EventType identifies what happened
type EventType string

const (
    EventTrade       EventType = "trade"
    EventOrderUpdate EventType = "order_update"
)

// Event flows from the matching engine outChan to the hub
type Event struct {
    Type        EventType
    Trade       *Trade
    OrderUpdate *OrderUpdate
}
```

- [ ] **Step 2: Commit**

```bash
git add internal/engine/types.go
git commit -m "feat: define core engine types"
```

---

## Task 3: Implement Order Book

**Files:**
- Create: `backend/internal/engine/orderbook.go`
- Create: `backend/internal/engine/orderbook_test.go`

- [ ] **Step 1: Write failing tests first**

```go
// internal/engine/orderbook_test.go
package engine

import (
    "testing"
)

func TestOrderBook_BestBidAsk_Empty(t *testing.T) {
    ob := NewOrderBook()
    if ob.BestBid() != nil {
        t.Fatal("expected nil best bid on empty book")
    }
    if ob.BestAsk() != nil {
        t.Fatal("expected nil best ask on empty book")
    }
}

func TestOrderBook_AddBid_BestBid(t *testing.T) {
    ob := NewOrderBook()
    o := &Order{ID: "1", Side: Buy, Price: 100.0, Remaining: 10.0}
    ob.AddOrder(o)
    best := ob.BestBid()
    if best == nil || best.Price != 100.0 {
        t.Fatalf("expected best bid 100.0, got %v", best)
    }
}

func TestOrderBook_BestBid_HighestPrice(t *testing.T) {
    ob := NewOrderBook()
    ob.AddOrder(&Order{ID: "1", Side: Buy, Price: 99.0, Remaining: 10.0})
    ob.AddOrder(&Order{ID: "2", Side: Buy, Price: 101.0, Remaining: 5.0})
    ob.AddOrder(&Order{ID: "3", Side: Buy, Price: 100.0, Remaining: 7.0})
    best := ob.BestBid()
    if best.Price != 101.0 {
        t.Fatalf("expected best bid 101.0, got %v", best.Price)
    }
}

func TestOrderBook_BestAsk_LowestPrice(t *testing.T) {
    ob := NewOrderBook()
    ob.AddOrder(&Order{ID: "1", Side: Sell, Price: 102.0, Remaining: 10.0})
    ob.AddOrder(&Order{ID: "2", Side: Sell, Price: 100.0, Remaining: 5.0})
    ob.AddOrder(&Order{ID: "3", Side: Sell, Price: 101.0, Remaining: 7.0})
    best := ob.BestAsk()
    if best.Price != 100.0 {
        t.Fatalf("expected best ask 100.0, got %v", best.Price)
    }
}

func TestOrderBook_Cancel_RemovesOrder(t *testing.T) {
    ob := NewOrderBook()
    o := &Order{ID: "abc", Side: Buy, Price: 100.0, Remaining: 10.0}
    ob.AddOrder(o)
    if !ob.Cancel("abc") {
        t.Fatal("expected cancel to return true")
    }
    if ob.BestBid() != nil {
        t.Fatal("expected empty book after cancel")
    }
}

func TestOrderBook_Cancel_UnknownID(t *testing.T) {
    ob := NewOrderBook()
    if ob.Cancel("nonexistent") {
        t.Fatal("expected cancel to return false for unknown id")
    }
}

func TestOrderBook_Depth_TopN(t *testing.T) {
    ob := NewOrderBook()
    for i := 0; i < 25; i++ {
        ob.AddOrder(&Order{
            ID: fmt.Sprintf("b%d", i), Side: Buy,
            Price: float64(100 - i), Remaining: float64(i + 1),
        })
    }
    bids, asks := ob.Depth(20)
    if len(bids) != 20 {
        t.Fatalf("expected 20 bid levels, got %d", len(bids))
    }
    if len(asks) != 0 {
        t.Fatalf("expected 0 ask levels, got %d", len(asks))
    }
    // Verify descending price order
    for i := 1; i < len(bids); i++ {
        if bids[i][0] > bids[i-1][0] {
            t.Fatal("bids not in descending order")
        }
    }
}

func TestOrderBook_FIFO_TimeOrder(t *testing.T) {
    ob := NewOrderBook()
    ob.AddOrder(&Order{ID: "first", Side: Buy, Price: 100.0, Remaining: 5.0})
    ob.AddOrder(&Order{ID: "second", Side: Buy, Price: 100.0, Remaining: 5.0})
    level := ob.BestBid()
    if level.Head.Order.ID != "first" {
        t.Fatalf("expected FIFO: first order at head, got %s", level.Head.Order.ID)
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && go test ./internal/engine/... -run TestOrderBook -v
```
Expected: compile error (NewOrderBook, AddOrder, etc. undefined)

- [ ] **Step 3: Implement orderbook.go**

```go
// internal/engine/orderbook.go
package engine

import (
    "fmt"

    "github.com/google/btree"
)

// orderIndex lets us find a LevelOrder in O(1) for cancellation
type orderIndex struct {
    side       Side
    price      float64
    levelOrder *LevelOrder
}

type OrderBook struct {
    bids   *btree.BTreeG[*PriceLevel]
    asks   *btree.BTreeG[*PriceLevel]
    orders map[string]*orderIndex
}

func NewOrderBook() *OrderBook {
    return &OrderBook{
        // bids: descending — highest price has highest priority (min of the tree = best bid)
        bids: btree.NewG[*PriceLevel](32, func(a, b *PriceLevel) bool {
            return a.Price > b.Price
        }),
        // asks: ascending — lowest price has highest priority (min of the tree = best ask)
        asks: btree.NewG[*PriceLevel](32, func(a, b *PriceLevel) bool {
            return a.Price < b.Price
        }),
        orders: make(map[string]*orderIndex),
    }
}

// AddOrder adds a resting limit order to the book.
// Does NOT match — matching is the matcher's job.
func (ob *OrderBook) AddOrder(o *Order) {
    tree := ob.treeFor(o.Side)
    key := &PriceLevel{Price: o.Price}
    existing, ok := tree.Get(key)
    if !ok {
        existing = &PriceLevel{Price: o.Price}
        tree.ReplaceOrInsert(existing)
    }
    node := &LevelOrder{Order: o}
    if existing.Tail == nil {
        existing.Head = node
        existing.Tail = node
    } else {
        node.Prev = existing.Tail
        existing.Tail.Next = node
        existing.Tail = node
    }
    existing.Volume += o.Remaining
    ob.orders[o.ID] = &orderIndex{side: o.Side, price: o.Price, levelOrder: node}
}

// Cancel removes an order by ID. Returns false if not found.
func (ob *OrderBook) Cancel(orderID string) bool {
    idx, ok := ob.orders[orderID]
    if !ok {
        return false
    }
    delete(ob.orders, orderID)
    tree := ob.treeFor(idx.side)
    key := &PriceLevel{Price: idx.price}
    level, ok := tree.Get(key)
    if !ok {
        return true // already gone
    }
    node := idx.levelOrder
    level.Volume -= node.Order.Remaining
    // Remove node from doubly-linked list
    if node.Prev != nil {
        node.Prev.Next = node.Next
    } else {
        level.Head = node.Next
    }
    if node.Next != nil {
        node.Next.Prev = node.Prev
    } else {
        level.Tail = node.Prev
    }
    // Remove empty price level
    if level.Head == nil {
        tree.Delete(key)
    }
    return true
}

// BestBid returns the highest-priced bid level, or nil if empty.
func (ob *OrderBook) BestBid() *PriceLevel {
    level, ok := ob.bids.Min()
    if !ok {
        return nil
    }
    return level
}

// BestAsk returns the lowest-priced ask level, or nil if empty.
func (ob *OrderBook) BestAsk() *PriceLevel {
    level, ok := ob.asks.Min()
    if !ok {
        return nil
    }
    return level
}

// Depth returns the top N bid and ask levels as [price, size] pairs.
func (ob *OrderBook) Depth(n int) (bids, asks [][2]float64) {
    ob.bids.Ascend(func(level *PriceLevel) bool {
        if len(bids) >= n {
            return false
        }
        bids = append(bids, [2]float64{level.Price, level.Volume})
        return true
    })
    ob.asks.Ascend(func(level *PriceLevel) bool {
        if len(asks) >= n {
            return false
        }
        asks = append(asks, [2]float64{level.Price, level.Volume})
        return true
    })
    return
}

// ConsumeFromLevel removes `size` from the front of a price level's queue.
// Returns orders consumed (for trade creation). Updates the book accordingly.
// Caller must pass the actual level pointer from BestBid/BestAsk.
func (ob *OrderBook) ConsumeFromLevel(level *PriceLevel, side Side, size float64) []*Order {
    var consumed []*Order
    remaining := size
    tree := ob.treeFor(side)
    for remaining > 0 && level.Head != nil {
        node := level.Head
        o := node.Order
        fill := min(remaining, o.Remaining)
        o.Remaining -= fill
        level.Volume -= fill
        remaining -= fill
        if o.Remaining == 0 {
            // Remove from level queue
            level.Head = node.Next
            if level.Head != nil {
                level.Head.Prev = nil
            } else {
                level.Tail = nil
            }
            delete(ob.orders, o.ID)
        }
        consumed = append(consumed, o)
        if o.Remaining > 0 {
            break // partially consumed this order
        }
    }
    if level.Head == nil {
        tree.Delete(level)
    }
    return consumed
}

func (ob *OrderBook) treeFor(side Side) *btree.BTreeG[*PriceLevel] {
    if side == Buy {
        return ob.bids
    }
    return ob.asks
}

// UpdateOrderIndex updates the index after partial fill changes Remaining.
// Call after modifying o.Remaining during matching.
func (ob *OrderBook) UpdateOrderRemaining(orderID string, newRemaining float64) {
    if idx, ok := ob.orders[orderID]; ok {
        idx.levelOrder.Order.Remaining = newRemaining
    }
}

func min(a, b float64) float64 {
    if a < b {
        return a
    }
    return b
}

// Sprintf shim so test file can use fmt without separate import issue
var _ = fmt.Sprintf
```

- [ ] **Step 4: Add missing import to test file**

Add `"fmt"` to test file imports.

- [ ] **Step 5: Run tests — all must pass**

```bash
cd backend && go test ./internal/engine/... -run TestOrderBook -v
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add internal/engine/orderbook.go internal/engine/orderbook_test.go
git commit -m "feat: implement BTree order book with O(1) cancel"
```

---

## Task 4: Implement Matching Engine

**Files:**
- Create: `backend/internal/engine/matcher.go`
- Create: `backend/internal/engine/matcher_test.go`

- [ ] **Step 1: Write failing tests**

```go
// internal/engine/matcher_test.go
package engine

import (
    "testing"
    "time"
)

func newOrder(id string, typ OrderType, side Side, price, size float64, userID string) *Order {
    return &Order{
        ID: id, Type: typ, Side: side,
        Price: price, Size: size, Remaining: size,
        UserID: userID, CreatedAt: time.Now(),
    }
}

func TestMatcher_LimitBuyNoMatch(t *testing.T) {
    m := NewMatcher()
    o := newOrder("1", TypeLimit, Buy, 99.0, 10.0, "human")
    trades, updates := m.Process(o)
    if len(trades) != 0 {
        t.Fatalf("expected no trades, got %d", len(trades))
    }
    _ = updates
    if m.ob.BestBid() == nil || m.ob.BestBid().Price != 99.0 {
        t.Fatal("order should rest in book")
    }
}

func TestMatcher_LimitBuyMatchesAsk(t *testing.T) {
    m := NewMatcher()
    // Place ask at 100
    m.Process(newOrder("ask1", TypeLimit, Sell, 100.0, 10.0, "system"))
    // Place bid at 100 — should match
    trades, _ := m.Process(newOrder("bid1", TypeLimit, Buy, 100.0, 5.0, "human"))
    if len(trades) != 1 {
        t.Fatalf("expected 1 trade, got %d", len(trades))
    }
    if trades[0].Price != 100.0 || trades[0].Size != 5.0 {
        t.Fatalf("unexpected trade: %+v", trades[0])
    }
    if trades[0].AggressorSide != Buy {
        t.Fatal("aggressor side should be buy")
    }
    // Remaining 5 should still be in book
    if m.ob.BestAsk() == nil || m.ob.BestAsk().Volume != 5.0 {
        t.Fatalf("expected 5 volume remaining, got %v", m.ob.BestAsk())
    }
}

func TestMatcher_PriceTimePriority(t *testing.T) {
    m := NewMatcher()
    // Two asks at same price — first in should match first
    m.Process(newOrder("ask-first", TypeLimit, Sell, 100.0, 5.0, "system"))
    m.Process(newOrder("ask-second", TypeLimit, Sell, 100.0, 5.0, "system"))
    trades, _ := m.Process(newOrder("bid1", TypeLimit, Buy, 100.0, 5.0, "human"))
    if len(trades) != 1 {
        t.Fatalf("expected 1 trade, got %d", len(trades))
    }
    if trades[0].SellOrderID != "ask-first" {
        t.Fatalf("expected ask-first to fill first, got %s", trades[0].SellOrderID)
    }
}

func TestMatcher_MarketOrderSweep(t *testing.T) {
    m := NewMatcher()
    m.Process(newOrder("ask1", TypeLimit, Sell, 100.0, 3.0, "system"))
    m.Process(newOrder("ask2", TypeLimit, Sell, 101.0, 3.0, "system"))
    // Market buy for 5 — should sweep across price levels
    trades, _ := m.Process(newOrder("mkt1", TypeMarket, Buy, 0, 5.0, "human"))
    if len(trades) != 2 {
        t.Fatalf("expected 2 trades (sweep 2 levels), got %d", len(trades))
    }
    totalFilled := trades[0].Size + trades[1].Size
    if totalFilled != 5.0 {
        t.Fatalf("expected total fill 5.0, got %f", totalFilled)
    }
}

func TestMatcher_CancelOrder(t *testing.T) {
    m := NewMatcher()
    m.Process(newOrder("bid1", TypeLimit, Buy, 99.0, 10.0, "human"))
    cancel := &Order{ID: "bid1", Type: TypeCancel}
    _, updates := m.Process(cancel)
    if m.ob.BestBid() != nil {
        t.Fatal("book should be empty after cancel")
    }
    if len(updates) != 1 || updates[0].Status != StatusCancelled {
        t.Fatal("expected order_update with cancelled status")
    }
}

func TestMatcher_PartialFill_EmitsUpdate(t *testing.T) {
    m := NewMatcher()
    m.Process(newOrder("ask1", TypeLimit, Sell, 100.0, 3.0, "system"))
    _, updates := m.Process(newOrder("bid1", TypeLimit, Buy, 100.0, 10.0, "human"))
    // bid for 10, only 3 available — partial fill
    partials := filterByStatus(updates, StatusPartial)
    if len(partials) == 0 {
        t.Fatal("expected partial order_update for human bid")
    }
    if partials[0].FilledSize != 3.0 {
        t.Fatalf("expected filled_size 3.0, got %f", partials[0].FilledSize)
    }
    if partials[0].RemainingSize != 7.0 {
        t.Fatalf("expected remaining 7.0, got %f", partials[0].RemainingSize)
    }
}

func filterByStatus(updates []*OrderUpdate, status string) []*OrderUpdate {
    var out []*OrderUpdate
    for _, u := range updates {
        if u.Status == status {
            out = append(out, u)
        }
    }
    return out
}
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd backend && go test ./internal/engine/... -run TestMatcher -v
```
Expected: compile error (NewMatcher undefined)

- [ ] **Step 3: Implement matcher.go**

```go
// internal/engine/matcher.go
package engine

import (
    "fmt"
    "time"

    "github.com/google/uuid"
)

// Matcher owns the order book and runs matching logic.
// Must be called from a single goroutine only.
type Matcher struct {
    ob            *OrderBook
    filledSizes   map[string]float64 // tracks total filled per human order ID
}

func NewMatcher() *Matcher {
    return &Matcher{
        ob:          NewOrderBook(),
        filledSizes: make(map[string]float64),
    }
}

// Process handles one incoming order message.
// Returns trades executed and order updates for human orders.
// MUST be called from a single goroutine.
func (m *Matcher) Process(o *Order) ([]*Trade, []*OrderUpdate) {
    switch o.Type {
    case TypeCancel:
        return m.handleCancel(o)
    case TypeLimit:
        return m.handleLimit(o)
    case TypeMarket:
        return m.handleMarket(o)
    }
    return nil, nil
}

func (m *Matcher) handleCancel(o *Order) ([]*Trade, []*OrderUpdate) {
    ok := m.ob.Cancel(o.ID)
    if !ok || o.UserID != "human" {
        return nil, nil
    }
    filled := m.filledSizes[o.ID]
    delete(m.filledSizes, o.ID)
    return nil, []*OrderUpdate{{
        OrderID:       o.ID,
        Status:        StatusCancelled,
        FilledSize:    filled,
        RemainingSize: 0,
        Price:         o.Price,
        Side:          o.Side,
        Ts:            nowMs(),
    }}
}

func (m *Matcher) handleLimit(o *Order) ([]*Trade, []*OrderUpdate) {
    var trades []*Trade
    var updates []*OrderUpdate
    isHuman := o.UserID == "human"

    if isHuman {
        updates = append(updates, &OrderUpdate{
            OrderID:       o.ID,
            Status:        StatusOpen,
            FilledSize:    0,
            RemainingSize: o.Remaining,
            Price:         o.Price,
            Side:          o.Side,
            Ts:            nowMs(),
        })
    }

    if o.Side == Buy {
        trades, updates = m.matchAgainstAsks(o, trades, updates, isHuman)
    } else {
        trades, updates = m.matchAgainstBids(o, trades, updates, isHuman)
    }

    // Rest unmatched remainder in the book
    if o.Remaining > 0 {
        m.ob.AddOrder(o)
    } else if isHuman {
        delete(m.filledSizes, o.ID)
    }
    return trades, updates
}

func (m *Matcher) handleMarket(o *Order) ([]*Trade, []*OrderUpdate) {
    var trades []*Trade
    var updates []*OrderUpdate
    isHuman := o.UserID == "human"
    if o.Side == Buy {
        trades, updates = m.matchAgainstAsks(o, trades, updates, isHuman)
    } else {
        trades, updates = m.matchAgainstBids(o, trades, updates, isHuman)
    }
    // Market orders don't rest — discard remainder
    return trades, updates
}

func (m *Matcher) matchAgainstAsks(o *Order, trades []*Trade, updates []*OrderUpdate, isHuman bool) ([]*Trade, []*OrderUpdate) {
    for o.Remaining > 0 {
        best := m.ob.BestAsk()
        if best == nil {
            break
        }
        // Limit orders only match at or below their price
        if o.Type == TypeLimit && best.Price > o.Price {
            break
        }
        fillPrice := best.Price
        // Snapshot maker userIDs before ConsumeFromLevel mutates the level
        type makerSnap struct{ id, userID string; origRemaining float64 }
        var makerSnaps []makerSnap
        for node := best.Head; node != nil; node = node.Next {
            makerSnaps = append(makerSnaps, makerSnap{node.Order.ID, node.Order.UserID, node.Order.Remaining})
        }
        consumed := m.ob.ConsumeFromLevel(best, Sell, o.Remaining)
        for i, maker := range consumed {
            // fillSize = how much was consumed from this maker order
            origRemaining := makerSnaps[i].origRemaining
            fillSize := origRemaining - maker.Remaining
            if fillSize <= 0 { fillSize = min(o.Remaining, origRemaining) }
            fillSize = min(fillSize, o.Remaining)
            makerIsHuman := makerSnaps[i].userID == "human"
            t := &Trade{
                ID:            "t_" + uuid.NewString(),
                Price:         fillPrice,
                Size:          fillSize,
                BuyOrderID:    o.ID,
                SellOrderID:   maker.ID,
                AggressorSide: Buy,
                HumanInvolved: isHuman || makerIsHuman,
                HumanIsBuyer:  isHuman,
                Ts:            nowMs(),
            }
            trades = append(trades, t)
            o.Remaining -= t.Size
            if isHuman {
                m.filledSizes[o.ID] += t.Size
                status := StatusPartial
                if o.Remaining <= 0 {
                    status = StatusFilled
                }
                updates = append(updates, &OrderUpdate{
                    OrderID:       o.ID,
                    Status:        status,
                    FilledSize:    m.filledSizes[o.ID],
                    RemainingSize: max(0, o.Remaining),
                    Price:         o.Price,
                    Side:          o.Side,
                    Ts:            nowMs(),
                })
            }
            if o.Remaining <= 0 {
                break
            }
        }
    }
    return trades, updates
}

func (m *Matcher) matchAgainstBids(o *Order, trades []*Trade, updates []*OrderUpdate, isHuman bool) ([]*Trade, []*OrderUpdate) {
    for o.Remaining > 0 {
        best := m.ob.BestBid()
        if best == nil {
            break
        }
        if o.Type == TypeLimit && best.Price < o.Price {
            break
        }
        fillPrice := best.Price
        type makerSnap struct{ id, userID string; origRemaining float64 }
        var makerSnaps []makerSnap
        for node := best.Head; node != nil; node = node.Next {
            makerSnaps = append(makerSnaps, makerSnap{node.Order.ID, node.Order.UserID, node.Order.Remaining})
        }
        consumed := m.ob.ConsumeFromLevel(best, Buy, o.Remaining)
        for i, maker := range consumed {
            origRemaining := makerSnaps[i].origRemaining
            fillSize := origRemaining - maker.Remaining
            if fillSize <= 0 { fillSize = min(o.Remaining, origRemaining) }
            fillSize = min(fillSize, o.Remaining)
            makerIsHuman := makerSnaps[i].userID == "human"
            t := &Trade{
                ID:            "t_" + uuid.NewString(),
                Price:         fillPrice,
                Size:          fillSize,
                BuyOrderID:    maker.ID,
                SellOrderID:   o.ID,
                AggressorSide: Sell,
                HumanInvolved: isHuman || makerIsHuman,
                HumanIsBuyer:  makerIsHuman,
                Ts:            nowMs(),
            }
            trades = append(trades, t)
            o.Remaining -= t.Size
            if isHuman {
                m.filledSizes[o.ID] += t.Size
                status := StatusPartial
                if o.Remaining <= 0 {
                    status = StatusFilled
                }
                updates = append(updates, &OrderUpdate{
                    OrderID:       o.ID,
                    Status:        status,
                    FilledSize:    m.filledSizes[o.ID],
                    RemainingSize: max(0, o.Remaining),
                    Price:         o.Price,
                    Side:          o.Side,
                    Ts:            nowMs(),
                })
            }
            if o.Remaining <= 0 {
                break
            }
        }
    }
    return trades, updates
}

// Depth delegates to the order book for snapshot broadcast
func (m *Matcher) Depth(n int) (bids, asks [][2]float64) {
    return m.ob.Depth(n)
}

func nowMs() int64 {
    return time.Now().UnixMilli()
}

func max(a, b float64) float64 {
    if a > b {
        return a
    }
    return b
}

var _ = fmt.Sprintf // suppress unused import
```

- [ ] **Step 4: Run tests — all must pass**

```bash
cd backend && go test ./internal/engine/... -run TestMatcher -v
```
Expected: all PASS. If trade size calculation is off, fix `matchAgainstAsks`/`matchAgainstBids` — the `ConsumeFromLevel` call returns partial order objects; recalculate `tradeSize` as `fillSize` for each consumed maker order based on their `Remaining` before consumption.

- [ ] **Step 5: Commit**

```bash
git add internal/engine/matcher.go internal/engine/matcher_test.go
git commit -m "feat: implement price-time priority matching engine"
```

---

## Task 5: Implement Candle Store

**Files:**
- Create: `backend/internal/engine/candles.go`

The candle store aggregates trade events into 1-second OHLCV candles and tracks session stats. It is NOT thread-safe — call only from the matching goroutine.

- [ ] **Step 1: Implement candles.go**

```go
// internal/engine/candles.go
package engine

import (
    "math"
    "sync"
    "time"
)

const maxCandles = 1000

// Candle represents a 1-second OHLCV bar
type Candle struct {
    Time   int64   `json:"time"`   // Unix seconds
    Open   float64 `json:"open"`
    High   float64 `json:"high"`
    Low    float64 `json:"low"`
    Close  float64 `json:"close"`
    Volume float64 `json:"volume"`
}

// SessionStats is broadcast every second to the frontend AssetBar
type SessionStats struct {
    SessionOpen   float64 `json:"session_open"`
    SessionHigh   float64 `json:"session_high"`
    SessionLow    float64 `json:"session_low"`
    LastPrice     float64 `json:"last_price"`
    SessionVolume float64 `json:"session_volume"`
    ChangePct     float64 `json:"change_pct"`
    Ts            int64   `json:"ts"`
}

// CandleStore holds a ring buffer of 1-second candles.
// Thread-safe reads via RLock for snapshot; writes from matching goroutine only.
type CandleStore struct {
    mu          sync.RWMutex
    candles     [maxCandles]Candle
    head        int // index of oldest candle
    count       int // number of valid candles
    currentSec  int64
    sessionOpen float64
    sessionHigh float64
    sessionLow  float64
    totalVolume float64
    lastPrice   float64
    initialized bool
}

func NewCandleStore(s0 float64) *CandleStore {
    return &CandleStore{
        sessionOpen: s0,
        sessionHigh: s0,
        sessionLow:  s0,
        lastPrice:   s0,
    }
}

// OnTrade updates the candle store with a new trade. Call from matching goroutine.
func (cs *CandleStore) OnTrade(price, size float64) {
    cs.mu.Lock()
    defer cs.mu.Unlock()

    nowSec := time.Now().Unix()
    cs.lastPrice = price
    cs.totalVolume += size

    if price > cs.sessionHigh {
        cs.sessionHigh = price
    }
    if price < cs.sessionLow || !cs.initialized {
        cs.sessionLow = price
    }
    cs.initialized = true

    if cs.currentSec != nowSec {
        // Start new candle
        if cs.count > 0 || cs.currentSec > 0 {
            cs.advance()
        }
        cs.currentSec = nowSec
        idx := cs.writeIndex()
        cs.candles[idx] = Candle{
            Time:   nowSec,
            Open:   price,
            High:   price,
            Low:    price,
            Close:  price,
            Volume: size,
        }
        if cs.count < maxCandles {
            cs.count++
        } else {
            cs.head = (cs.head + 1) % maxCandles
        }
    } else {
        // Update current candle
        idx := cs.writeIndex()
        c := &cs.candles[idx]
        if price > c.High {
            c.High = price
        }
        if price < c.Low {
            c.Low = price
        }
        c.Close = price
        c.Volume += size
    }
}

// Snapshot returns the last n candles in chronological order. Thread-safe.
func (cs *CandleStore) Snapshot(n int) []Candle {
    cs.mu.RLock()
    defer cs.mu.RUnlock()
    if cs.count == 0 {
        return nil
    }
    if n > cs.count {
        n = cs.count
    }
    out := make([]Candle, n)
    start := (cs.head + cs.count - n + maxCandles) % maxCandles
    for i := 0; i < n; i++ {
        out[i] = cs.candles[(start+i)%maxCandles]
    }
    return out
}

// Stats returns current session statistics. Thread-safe.
func (cs *CandleStore) Stats() SessionStats {
    cs.mu.RLock()
    defer cs.mu.RUnlock()
    changePct := 0.0
    if cs.sessionOpen > 0 {
        changePct = math.Round(((cs.lastPrice-cs.sessionOpen)/cs.sessionOpen)*10000) / 100
    }
    return SessionStats{
        SessionOpen:   cs.sessionOpen,
        SessionHigh:   cs.sessionHigh,
        SessionLow:    cs.sessionLow,
        LastPrice:     cs.lastPrice,
        SessionVolume: math.Round(cs.totalVolume*100) / 100,
        ChangePct:     changePct,
        Ts:            time.Now().UnixMilli(),
    }
}

func (cs *CandleStore) writeIndex() int {
    return (cs.head + cs.count - 1 + maxCandles) % maxCandles
}

func (cs *CandleStore) advance() {
    // nothing to advance — count management happens in OnTrade
}
```

- [ ] **Step 2: Run all engine tests to confirm nothing broke**

```bash
cd backend && go test ./internal/engine/... -v
```
Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add internal/engine/candles.go
git commit -m "feat: implement 1s OHLCV candle ring buffer and session stats"
```

---

## Task 6: Implement GBM Market Generator

**Files:**
- Create: `backend/internal/generator/gbm.go`

- [ ] **Step 1: Implement gbm.go**

```go
// internal/generator/gbm.go
package generator

import (
    "context"
    "fmt"
    "math"
    "math/rand/v2"
    "time"

    "github.com/nextbull/trading-terminal/internal/engine"
)

// Config holds GBM parameters (read from env in main.go)
type Config struct {
    S0      float64 // initial price
    Mu      float64 // drift (0.0 = fair market)
    Sigma   float64 // volatility (e.g. 0.02)
    TickMs  int     // milliseconds between ticks (10 = ~100 orders/sec)
}

// DefaultConfig matches the spec parameters
func DefaultConfig() Config {
    return Config{S0: 100.0, Mu: 0.0, Sigma: 0.02, TickMs: 10}
}

// Generator runs the GBM process and pushes limit orders into inChan.
// Call Run in a separate goroutine.
type Generator struct {
    cfg    Config
    inChan chan<- *engine.Order
    price  float64
    t      float64 // accumulated time in seconds
    seq    int
}

func New(cfg Config, inChan chan<- *engine.Order) *Generator {
    return &Generator{cfg: cfg, inChan: inChan, price: cfg.S0}
}

// Run blocks until ctx is cancelled.
func (g *Generator) Run(ctx context.Context) {
    dt := float64(g.cfg.TickMs) / 1000.0 // tick size in seconds
    ticker := time.NewTicker(time.Duration(g.cfg.TickMs) * time.Millisecond)
    defer ticker.Stop()
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            g.tick(dt)
        }
    }
}

func (g *Generator) tick(dt float64) {
    // GBM step: S_{t+dt} = S_t * exp((mu - sigma^2/2)*dt + sigma*sqrt(dt)*Z)
    z := rand.NormFloat64()
    g.price *= math.Exp((g.cfg.Mu-0.5*g.cfg.Sigma*g.cfg.Sigma)*dt +
        g.cfg.Sigma*math.Sqrt(dt)*z)
    g.t += dt

    mid := g.price
    numBids := 3 + rand.IntN(3) // 3–5
    numAsks := 3 + rand.IntN(3)

    for i := 0; i < numBids; i++ {
        offset := rand.Float64() * 0.005 // 0–0.5% below mid
        price := roundTo2(mid * (1 - offset))
        size := 1.0 + rand.Float64()*49.0
        g.emit(engine.Buy, price, size)
    }
    for i := 0; i < numAsks; i++ {
        offset := rand.Float64() * 0.005
        price := roundTo2(mid * (1 + offset))
        size := 1.0 + rand.Float64()*49.0
        g.emit(engine.Sell, price, size)
    }
}

func (g *Generator) emit(side engine.Side, price, size float64) {
    g.seq++
    o := &engine.Order{
        ID:        fmt.Sprintf("sys_%d", g.seq),
        Type:      engine.TypeLimit,
        Side:      side,
        Price:     price,
        Size:      size,
        Remaining: size,
        UserID:    "system",
        CreatedAt: time.Now(),
    }
    select {
    case g.inChan <- o:
    default:
        // inChan full — drop silently (engine is overloaded, rare)
    }
}

func roundTo2(f float64) float64 {
    return math.Round(f*100) / 100
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd backend && go build ./internal/generator/...
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add internal/generator/gbm.go
git commit -m "feat: implement GBM market generator at ~100 orders/sec"
```

---

## Task 7: Implement WebSocket Hub

**Files:**
- Create: `backend/internal/hub/hub.go`

- [ ] **Step 1: Implement hub.go**

```go
// internal/hub/hub.go
package hub

import (
    "context"
    "encoding/json"
    "log"
    "net/http"
    "sync"
    "time"

    "github.com/coder/websocket"
)

const (
    clientBufSize  = 256
    writeWait      = 10 * time.Second
    pongWait       = 60 * time.Second
    maxMessageSize = 4096
)

// Client represents a connected browser
type Client struct {
    conn   *websocket.Conn
    send   chan []byte
    hub    *Hub
    ctx    context.Context
    cancel context.CancelFunc
}

// Hub manages all WebSocket clients and broadcasts messages.
type Hub struct {
    mu        sync.Mutex
    clients   map[*Client]struct{}
    broadcast chan []byte
    register  chan *Client
    unregister chan *Client
}

func New() *Hub {
    return &Hub{
        clients:    make(map[*Client]struct{}),
        broadcast:  make(chan []byte, 512),
        register:   make(chan *Client, 16),
        unregister: make(chan *Client, 16),
    }
}

// Run is the hub's single broadcast goroutine. Call in a separate goroutine.
func (h *Hub) Run(ctx context.Context) {
    for {
        select {
        case <-ctx.Done():
            return
        case c := <-h.register:
            h.mu.Lock()
            h.clients[c] = struct{}{}
            h.mu.Unlock()
        case c := <-h.unregister:
            h.mu.Lock()
            if _, ok := h.clients[c]; ok {
                delete(h.clients, c)
                close(c.send)
            }
            h.mu.Unlock()
        case msg := <-h.broadcast:
            h.mu.Lock()
            for c := range h.clients {
                select {
                case c.send <- msg:
                default:
                    // Slow client — disconnect
                    delete(h.clients, c)
                    close(c.send)
                    c.cancel()
                }
            }
            h.mu.Unlock()
        }
    }
}

// Broadcast sends a pre-serialized message to all clients.
// Safe to call from any goroutine.
func (h *Hub) Broadcast(msg []byte) {
    select {
    case h.broadcast <- msg:
    default:
        log.Println("hub: broadcast channel full, dropping message")
    }
}

// BroadcastJSON serializes v and broadcasts it. Pre-serialize if called frequently.
func (h *Hub) BroadcastJSON(v any) {
    b, err := json.Marshal(v)
    if err != nil {
        log.Printf("hub: marshal error: %v", err)
        return
    }
    h.Broadcast(b)
}

// Send sends a message to a single client (used for snapshot on connect).
func (h *Hub) Send(c *Client, msg []byte) {
    select {
    case c.send <- msg:
    default:
        // Client is slow — skip
    }
}

// ServeWS upgrades an HTTP connection to WebSocket and registers the client.
// snapshotFn is called once on connect to send the initial snapshot.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request, snapshotFn func() []byte) {
    conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
        InsecureSkipVerify: true, // allow any origin (competition demo)
    })
    if err != nil {
        log.Printf("ws accept error: %v", err)
        return
    }

    ctx, cancel := context.WithCancel(r.Context())
    c := &Client{
        conn:   conn,
        send:   make(chan []byte, clientBufSize),
        hub:    h,
        ctx:    ctx,
        cancel: cancel,
    }
    h.register <- c

    // Send snapshot immediately
    if snapshotFn != nil {
        if snap := snapshotFn(); snap != nil {
            c.send <- snap
        }
    }

    go c.writePump()
    c.readPump() // blocks until client disconnects
    h.unregister <- c
}

// readPump drains inbound messages (we ignore them — orders go via REST)
func (c *Client) readPump() {
    defer c.cancel()
    c.conn.SetReadLimit(maxMessageSize)
    for {
        _, _, err := c.conn.Read(c.ctx)
        if err != nil {
            return
        }
    }
}

// writePump drains the send channel and writes to the WebSocket
func (c *Client) writePump() {
    defer c.conn.Close(websocket.StatusNormalClosure, "")
    for {
        select {
        case msg, ok := <-c.send:
            if !ok {
                return
            }
            ctx, cancel := context.WithTimeout(c.ctx, writeWait)
            err := c.conn.Write(ctx, websocket.MessageText, msg)
            cancel()
            if err != nil {
                return
            }
        case <-c.ctx.Done():
            return
        }
    }
}

// ClientCount returns the number of connected clients. Thread-safe.
func (h *Hub) ClientCount() int {
    h.mu.Lock()
    defer h.mu.Unlock()
    return len(h.clients)
}
```

- [ ] **Step 2: Verify compiles**

```bash
cd backend && go build ./internal/hub/...
```

- [ ] **Step 3: Commit**

```bash
git add internal/hub/hub.go
git commit -m "feat: implement WebSocket hub with per-client buffered writePump"
```

---

## Task 8: Implement HTTP Handlers

**Files:**
- Create: `backend/internal/api/handlers.go`

- [ ] **Step 1: Implement handlers.go**

```go
// internal/api/handlers.go
package api

import (
    "encoding/json"
    "fmt"
    "net/http"
    "strconv"
    "time"

    "github.com/google/uuid"
    "github.com/nextbull/trading-terminal/internal/engine"
)

// OrderRequest is the POST /orders JSON body
type OrderRequest struct {
    Type  string  `json:"type"`  // "limit" or "market"
    Side  string  `json:"side"`  // "buy" or "sell"
    Price float64 `json:"price"` // omit for market orders
    Size  float64 `json:"size"`
}

// OrderResponse is the POST /orders JSON response
type OrderResponse struct {
    OrderID string `json:"order_id"`
    Status  string `json:"status"`
}

// Handlers holds dependencies for HTTP handlers
type Handlers struct {
    inChan chan<- *engine.Order
}

func New(inChan chan<- *engine.Order) *Handlers {
    return &Handlers{inChan: inChan}
}

func (h *Handlers) PostOrder(w http.ResponseWriter, r *http.Request) {
    var req OrderRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid JSON", http.StatusBadRequest)
        return
    }
    if req.Size <= 0 {
        http.Error(w, "size must be positive", http.StatusBadRequest)
        return
    }

    var typ engine.OrderType
    switch req.Type {
    case "limit":
        typ = engine.TypeLimit
        if req.Price <= 0 {
            http.Error(w, "price required for limit orders", http.StatusBadRequest)
            return
        }
    case "market":
        typ = engine.TypeMarket
    default:
        http.Error(w, "type must be limit or market", http.StatusBadRequest)
        return
    }

    var side engine.Side
    switch req.Side {
    case "buy":
        side = engine.Buy
    case "sell":
        side = engine.Sell
    default:
        http.Error(w, "side must be buy or sell", http.StatusBadRequest)
        return
    }

    orderID := "o_" + uuid.NewString()
    o := &engine.Order{
        ID:        orderID,
        Type:      typ,
        Side:      side,
        Price:     req.Price,
        Size:      req.Size,
        Remaining: req.Size,
        UserID:    "human",
        CreatedAt: time.Now(),
    }

    select {
    case h.inChan <- o:
    default:
        http.Error(w, "engine overloaded, try again", http.StatusServiceUnavailable)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(OrderResponse{OrderID: orderID, Status: "accepted"})
}

func (h *Handlers) DeleteOrder(w http.ResponseWriter, r *http.Request) {
    // Path: DELETE /orders/{id}
    id := r.PathValue("id")
    if id == "" {
        http.Error(w, "missing order id", http.StatusBadRequest)
        return
    }
    cancel := &engine.Order{
        ID:   id,
        Type: engine.TypeCancel,
    }
    select {
    case h.inChan <- cancel:
    default:
        http.Error(w, "engine overloaded", http.StatusServiceUnavailable)
        return
    }
    w.WriteHeader(http.StatusNoContent)
}

func GetCandles(candlesFn func(n int) interface{}) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        n := 300
        if lim := r.URL.Query().Get("limit"); lim != "" {
            if v, err := strconv.Atoi(lim); err == nil && v > 0 && v <= 1000 {
                n = v
            }
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{
            "candles": candlesFn(n),
        })
    }
}

func HealthHandler(ready *func() bool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        if ready != nil && !(*ready)() {
            http.Error(w, "not ready", http.StatusServiceUnavailable)
            return
        }
        w.Header().Set("Content-Type", "application/json")
        fmt.Fprint(w, `{"status":"ok"}`)
    }
}

// CORS middleware — allows browser connections from any origin (competition demo)
func CORS(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Access-Control-Allow-Origin", "*")
        w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
        if r.Method == http.MethodOptions {
            w.WriteHeader(http.StatusNoContent)
            return
        }
        next.ServeHTTP(w, r)
    })
}
```

- [ ] **Step 2: Verify compiles**

```bash
cd backend && go build ./internal/api/...
```

- [ ] **Step 3: Commit**

```bash
git add internal/api/handlers.go
git commit -m "feat: implement HTTP handlers for order submission and candles"
```

---

## Task 9: Wire Everything in main.go

**Files:**
- Create: `backend/cmd/server/main.go`

- [ ] **Step 1: Implement main.go**

```go
// cmd/server/main.go
package main

import (
    "context"
    "encoding/json"
    "log"
    "net/http"
    "os"
    "os/signal"
    "strconv"
    "sync/atomic"
    "syscall"
    "time"

    "github.com/nextbull/trading-terminal/internal/api"
    "github.com/nextbull/trading-terminal/internal/engine"
    "github.com/nextbull/trading-terminal/internal/generator"
    "github.com/nextbull/trading-terminal/internal/hub"
)

func main() {
    cfg := generator.Config{
        S0:     envFloat("GBM_S0", 100.0),
        Mu:     envFloat("GBM_MU", 0.0),
        Sigma:  envFloat("GBM_SIGMA", 0.02),
        TickMs: envInt("GBM_TICK_MS", 10),
    }
    port := envStr("BACKEND_PORT", "8080")

    ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
    defer cancel()

    inChan := make(chan *engine.Order, 1024)
    outChan := make(chan *engine.Event, 1024)

    matcher := engine.NewMatcher()
    candleStore := engine.NewCandleStore(cfg.S0)
    portfolio := engine.NewPortfolio(100_000.0) // $100k starting capital
    wsHub := hub.New()

    // Track readiness for health check
    var ready atomic.Bool

    // Human order handlers
    handlers := api.New(inChan)

    // Snapshot function — called on each new WS connection
    snapshotFn := func() []byte {
        bids, asks := matcher.Depth(20)
        snap := map[string]any{
            "type": "snapshot",
            "book": map[string]any{
                "bids": bids, "asks": asks,
                "ts": time.Now().UnixMilli(),
            },
            "candles":   candleStore.Snapshot(300),
            "portfolio": portfolio.State(candleStore.Stats().LastPrice),
            "ts":        time.Now().UnixMilli(),
        }
        b, _ := json.Marshal(snap)
        return b
    }

    // HTTP router
    mux := http.NewServeMux()
    mux.HandleFunc("POST /orders", handlers.PostOrder)
    mux.HandleFunc("DELETE /orders/{id}", handlers.DeleteOrder)
    mux.HandleFunc("GET /candles", api.GetCandles(func(n int) interface{} {
        return candleStore.Snapshot(n)
    }))
    isReady := func() bool { return ready.Load() }
    mux.HandleFunc("GET /health", api.HealthHandler(&isReady))
    mux.HandleFunc("GET /ws", func(w http.ResponseWriter, r *http.Request) {
        wsHub.ServeWS(w, r, snapshotFn)
    })

    srv := &http.Server{
        Addr:    ":" + port,
        Handler: api.CORS(mux),
    }

    // 1. WebSocket hub goroutine
    go wsHub.Run(ctx)

    // 2. Matching engine goroutine (single goroutine, owns all state)
    go func() {
        ready.Store(true)
        bookTicker := time.NewTicker(100 * time.Millisecond)
        statsTicker := time.NewTicker(1 * time.Second)
        defer bookTicker.Stop()
        defer statsTicker.Stop()

        for {
            select {
            case <-ctx.Done():
                return

            case o := <-inChan:
                trades, updates := matcher.Process(o)
                for _, t := range trades {
                    candleStore.OnTrade(t.Price, t.Size)
                    portfolio.OnTrade(t) // uses t.HumanInvolved + t.HumanIsBuyer internally
                    msg, _ := json.Marshal(map[string]any{
                        "type": "trade", "id": t.ID,
                        "price": t.Price, "size": t.Size,
                        "side": t.AggressorSide, "ts": t.Ts,
                    })
                    wsHub.Broadcast(msg)
                }
                for _, u := range updates {
                    msg, _ := json.Marshal(map[string]any{
                        "type": "order_update",
                        "order_id": u.OrderID, "status": u.Status,
                        "filled_size": u.FilledSize, "remaining_size": u.RemainingSize,
                        "price": u.Price, "side": u.Side, "ts": u.Ts,
                    })
                    wsHub.Broadcast(msg)
                    // Also send portfolio update after fills
                    if u.Status == engine.StatusPartial || u.Status == engine.StatusFilled {
                        pState := portfolio.State(candleStore.Stats().LastPrice)
                        pmsg, _ := json.Marshal(pState)
                        wsHub.Broadcast(pmsg)
                    }
                }

            case <-bookTicker.C:
                bids, asks := matcher.Depth(20)
                msg, _ := json.Marshal(map[string]any{
                    "type": "book", "bids": bids, "asks": asks,
                    "ts": time.Now().UnixMilli(),
                })
                wsHub.Broadcast(msg)

            case <-statsTicker.C:
                stats := candleStore.Stats()
                msg, _ := json.Marshal(map[string]any{
                    "type":           "stats",
                    "session_open":   stats.SessionOpen,
                    "session_high":   stats.SessionHigh,
                    "session_low":    stats.SessionLow,
                    "last_price":     stats.LastPrice,
                    "session_volume": stats.SessionVolume,
                    "change_pct":     stats.ChangePct,
                    "ts":             stats.Ts,
                })
                wsHub.Broadcast(msg)
            }
        }
    }()

    // 3. GBM generator goroutine
    gen := generator.New(cfg, inChan)
    go gen.Run(ctx)

    // 4. HTTP server
    go func() {
        log.Printf("NEXTBULL backend listening on :%s", port)
        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("http server error: %v", err)
        }
    }()

    <-ctx.Done()
    log.Println("shutting down...")
    shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer shutCancel()
    srv.Shutdown(shutCtx)
}

func envFloat(key string, def float64) float64 {
    if v := os.Getenv(key); v != "" {
        if f, err := strconv.ParseFloat(v, 64); err == nil {
            return f
        }
    }
    return def
}

func envInt(key string, def int) int {
    if v := os.Getenv(key); v != "" {
        if i, err := strconv.Atoi(v); err == nil {
            return i
        }
    }
    return def
}

func envStr(key, def string) string {
    if v := os.Getenv(key); v != "" {
        return v
    }
    return def
}
```

- [ ] **Step 2: Implement Portfolio tracker (needed by main.go)**

Create `backend/internal/engine/portfolio.go`:

```go
// internal/engine/portfolio.go
package engine

import (
    "math"
    "sync"
    "time"
)

// Portfolio tracks the human user's cash, holdings, and P&L.
// Thread-safe (reads from HTTP handlers, writes from matching goroutine).
type Portfolio struct {
    mu           sync.RWMutex
    cash         float64
    holdings     float64
    avgEntry     float64
    realizedPnl  float64
    startingCash float64
}

func NewPortfolio(startingCash float64) *Portfolio {
    return &Portfolio{cash: startingCash, startingCash: startingCash}
}

// OnTrade updates the portfolio when a trade occurs.
// Uses t.HumanInvolved and t.HumanIsBuyer to correctly handle human makers and takers.
func (p *Portfolio) OnTrade(t *Trade) {
    if !t.HumanInvolved {
        return
    }
    p.mu.Lock()
    defer p.mu.Unlock()

    if t.HumanIsBuyer {
        // Human bought: spend cash, gain BULL
        cost := t.Price * t.Size
        p.cash -= cost
        // Update average entry price
        totalHoldings := p.holdings + t.Size
        if totalHoldings > 0 {
            p.avgEntry = (p.avgEntry*p.holdings + t.Price*t.Size) / totalHoldings
        }
        p.holdings += t.Size
    } else {
        // Human sold: gain cash, reduce BULL
        proceeds := t.Price * t.Size
        if p.holdings > 0 {
            // Realized P&L on this portion
            p.realizedPnl += (t.Price - p.avgEntry) * t.Size
        }
        p.cash += proceeds
        p.holdings -= t.Size
        if p.holdings <= 0 {
            p.holdings = 0
            p.avgEntry = 0
        }
    }
}

// State returns a portfolio snapshot for WS broadcast.
// lastPrice is needed to compute unrealized P&L and equity.
func (p *Portfolio) State(lastPrice float64) map[string]any {
    p.mu.RLock()
    defer p.mu.RUnlock()

    unrealizedPnl := 0.0
    if p.holdings > 0 && p.avgEntry > 0 {
        unrealizedPnl = (lastPrice - p.avgEntry) * p.holdings
    }
    equity := p.cash + p.holdings*lastPrice
    return map[string]any{
        "type":           "portfolio",
        "cash":           round2(p.cash),
        "holdings":       round2(p.holdings),
        "avg_entry":      round2(p.avgEntry),
        "unrealized_pnl": round2(unrealizedPnl),
        "realized_pnl":   round2(p.realizedPnl),
        "equity":         round2(equity),
        "ts":             time.Now().UnixMilli(),
    }
}

func round2(f float64) float64 {
    return math.Round(f*100) / 100
}
```

- [ ] **Step 3: Build entire backend**

```bash
cd backend && go build ./...
```
Expected: no errors. Fix any import or type mismatches.

- [ ] **Step 4: Run the backend locally**

```bash
cd backend && GBM_S0=100 GBM_TICK_MS=10 go run ./cmd/server/
```
Expected: `NEXTBULL backend listening on :8080`

- [ ] **Step 5: Smoke test WebSocket in another terminal**

```bash
# Install wscat if needed: npm install -g wscat
wscat -c ws://localhost:8080/ws
```
Expected: immediately receive a `snapshot` JSON message, then `book` every 100ms, `trade` events as GBM matches occur, `stats` every 1s.

- [ ] **Step 6: Smoke test POST /orders**

```bash
curl -X POST http://localhost:8080/orders \
  -H "Content-Type: application/json" \
  -d '{"type":"market","side":"buy","size":10}'
```
Expected: `{"order_id":"o_...","status":"accepted"}`

- [ ] **Step 7: Commit**

```bash
git add cmd/server/main.go internal/engine/portfolio.go
git commit -m "feat: wire matching engine, GBM generator, hub, and HTTP server"
```

---

## Task 10: Dockerfile and Docker Compose

**Files:**
- Create: `backend/Dockerfile`
- Create: `compose.yaml` (repo root)
- Create: `.env.example` (repo root)

- [ ] **Step 1: Write backend Dockerfile**

```dockerfile
# backend/Dockerfile
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server ./cmd/server/

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /app/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```

- [ ] **Step 2: Write compose.yaml at repo root**

```yaml
# compose.yaml
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    env_file: .env
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
    restart: unless-stopped
```

Note: frontend service will be added in Phase 2.

- [ ] **Step 3: Write .env.example**

```bash
# .env.example — copy to .env and adjust as needed
BACKEND_PORT=8080
FRONTEND_PORT=3000

# Browser-facing (used by Next.js client bundle)
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
NEXT_PUBLIC_API_URL=http://localhost:8080

# Internal Docker DNS (server-side Next.js calls only)
BACKEND_INTERNAL_URL=http://backend:8080

# GBM parameters
GBM_S0=100.0
GBM_MU=0.0
GBM_SIGMA=0.02
GBM_TICK_MS=10
```

- [ ] **Step 4: Copy .env.example to .env**

```bash
cp .env.example .env
```

- [ ] **Step 5: Build and run with Docker Compose**

```bash
docker compose up --build
```
Expected: backend starts, health check passes, logs show `NEXTBULL backend listening on :8080`

- [ ] **Step 6: Verify health endpoint**

```bash
curl http://localhost:8080/health
```
Expected: `{"status":"ok"}`

- [ ] **Step 7: Commit**

```bash
git add backend/Dockerfile compose.yaml .env.example
git commit -m "feat: add Dockerfile and docker compose for backend"
```

---

## Task 11: Full Integration Test

- [ ] **Step 1: Run all Go tests**

```bash
cd backend && go test ./... -v
```
Expected: all PASS

- [ ] **Step 2: Load test — confirm 100 orders/sec throughput**

```bash
# Run backend, then in another terminal:
wscat -c ws://localhost:8080/ws > /tmp/ws_output.txt &
sleep 5
kill %1
wc -l /tmp/ws_output.txt
```
Expected: ~50+ lines (book every 100ms = 50/5s, trades on top of that)

- [ ] **Step 3: Test order cancel flow**

```bash
# Place limit order
RESPONSE=$(curl -s -X POST http://localhost:8080/orders \
  -H "Content-Type: application/json" \
  -d '{"type":"limit","side":"buy","price":1.0,"size":100}')
ORDER_ID=$(echo $RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['order_id'])")
echo "Placed: $ORDER_ID"

# Cancel it
curl -X DELETE http://localhost:8080/orders/$ORDER_ID
echo "Cancelled"
```
Expected: 204 No Content on cancel

- [ ] **Step 4: Final docker compose up test**

```bash
docker compose down && docker compose up --build -d
sleep 5
curl http://localhost:8080/health
curl "http://localhost:8080/candles?limit=10"
```
Expected: health ok, candles array with up to 10 entries

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Phase 1 complete — Go backend with matching engine, GBM, WebSocket hub, Docker"
```

---

## Phase 1 Complete

The backend is now:
- Accepting human orders via `POST /orders` and `DELETE /orders/{id}`
- Generating ~100 synthetic market orders/sec via GBM
- Matching all orders with strict price-time priority
- Broadcasting `book`, `trade`, `stats`, `order_update`, `portfolio`, and `snapshot` messages over WebSocket
- Serving historical candles via `GET /candles`
- Dockerized and launchable with `docker compose up`

**Next:** Phase 2 — Next.js frontend (plan: `docs/superpowers/plans/2026-03-25-phase2-frontend.md`)
