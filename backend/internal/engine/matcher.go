package engine

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

// Matcher owns the order book and runs matching logic.
// Process and PurgeStaleHumanOrders must be called from a single goroutine.
// Depth is safe to call concurrently (e.g. from an HTTP snapshot handler).
type Matcher struct {
	mu          sync.RWMutex
	ob          *OrderBook
	filledSizes map[string]float64 // tracks cumulative filled size per human order ID
	humanOrders map[string]*Order  // original order details for cancel metadata and maker updates
}

func NewMatcher() *Matcher {
	return &Matcher{
		ob:          NewOrderBook(),
		filledSizes: make(map[string]float64),
		humanOrders: make(map[string]*Order),
	}
}

// Process handles one incoming order message.
// Returns trades executed and order updates for human orders.
// MUST be called from a single goroutine.
func (m *Matcher) Process(o *Order) ([]*Trade, []*OrderUpdate) {
	m.mu.Lock()
	defer m.mu.Unlock()
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
	// Ownership check BEFORE touching the book — system orders are never in
	// filledSizes so this prevents cancelling non-human orders.
	filled, isHumanOrder := m.filledSizes[o.ID]
	if !isHumanOrder {
		return nil, nil
	}
	orig := m.humanOrders[o.ID]
	ok := m.ob.Cancel(o.ID)
	delete(m.filledSizes, o.ID)
	delete(m.humanOrders, o.ID)
	if !ok {
		// Order was already fully filled (removed from book) — no update needed.
		return nil, nil
	}
	return nil, []*OrderUpdate{{
		OrderID:       o.ID,
		Status:        StatusCancelled,
		FilledSize:    filled,
		RemainingSize: 0,
		Price:         orig.Price,
		Side:          orig.Side,
		Ts:            nowMs(),
	}}
}

func (m *Matcher) handleLimit(o *Order) ([]*Trade, []*OrderUpdate) {
	var trades []*Trade
	var updates []*OrderUpdate
	isHuman := o.UserID == "human"

	if isHuman {
		m.filledSizes[o.ID] = 0
		m.humanOrders[o.ID] = o
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
		// Fully filled as taker — clean up tracking
		delete(m.filledSizes, o.ID)
		delete(m.humanOrders, o.ID)
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
	// Market orders never rest — clean up any tracking entries
	if isHuman {
		delete(m.filledSizes, o.ID)
	}
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
		// Snapshot maker state BEFORE ConsumeFromLevel mutates the level
		type makerSnap struct {
			id, userID    string
			origRemaining float64
		}
		var snaps []makerSnap
		for node := best.Head; node != nil; node = node.Next {
			snaps = append(snaps, makerSnap{node.Order.ID, node.Order.UserID, node.Order.Remaining})
		}
		consumed := m.ob.ConsumeFromLevel(best, Sell, o.Remaining)
		for i, maker := range consumed {
			origRemaining := snaps[i].origRemaining
			fillSize := origRemaining - maker.Remaining
			if fillSize <= 0 {
				fillSize = minF(o.Remaining, origRemaining)
			}
			fillSize = minF(fillSize, o.Remaining)
			makerIsHuman := snaps[i].userID == "human"
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
					RemainingSize: maxF(0, o.Remaining),
					Price:         o.Price,
					Side:          o.Side,
					Ts:            nowMs(),
				})
			}
			if makerIsHuman {
				updates = append(updates, m.emitMakerUpdate(maker.ID, fillSize))
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
		type makerSnap struct {
			id, userID    string
			origRemaining float64
		}
		var snaps []makerSnap
		for node := best.Head; node != nil; node = node.Next {
			snaps = append(snaps, makerSnap{node.Order.ID, node.Order.UserID, node.Order.Remaining})
		}
		consumed := m.ob.ConsumeFromLevel(best, Buy, o.Remaining)
		for i, maker := range consumed {
			origRemaining := snaps[i].origRemaining
			fillSize := origRemaining - maker.Remaining
			if fillSize <= 0 {
				fillSize = minF(o.Remaining, origRemaining)
			}
			fillSize = minF(fillSize, o.Remaining)
			makerIsHuman := snaps[i].userID == "human"
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
					RemainingSize: maxF(0, o.Remaining),
					Price:         o.Price,
					Side:          o.Side,
					Ts:            nowMs(),
				})
			}
			if makerIsHuman {
				updates = append(updates, m.emitMakerUpdate(maker.ID, fillSize))
			}
			if o.Remaining <= 0 {
				break
			}
		}
	}
	return trades, updates
}

// emitMakerUpdate builds an OrderUpdate for a human maker order being filled.
// Cleans up tracking state when the maker order is fully filled.
func (m *Matcher) emitMakerUpdate(makerID string, fillSize float64) *OrderUpdate {
	m.filledSizes[makerID] += fillSize
	filled := m.filledSizes[makerID]
	orig := m.humanOrders[makerID]
	remaining := orig.Size - filled
	status := StatusPartial
	if remaining <= 0 {
		status = StatusFilled
		delete(m.filledSizes, makerID)
		delete(m.humanOrders, makerID)
	}
	return &OrderUpdate{
		OrderID:       makerID,
		Status:        status,
		FilledSize:    filled,
		RemainingSize: maxF(0, remaining),
		Price:         orig.Price,
		Side:          orig.Side,
		Ts:            nowMs(),
	}
}

// Depth returns the top-N price levels. Safe to call concurrently with Process.
func (m *Matcher) Depth(n int) (bids, asks [][2]float64) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.ob.Depth(n)
}

// PurgeStaleHumanOrders cancels and removes tracking for resting human orders
// older than maxAge. Call periodically from the matching goroutine.
func (m *Matcher) PurgeStaleHumanOrders(maxAge time.Duration) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	cutoff := time.Now().Add(-maxAge)
	purged := 0
	for id, o := range m.humanOrders {
		if o.CreatedAt.Before(cutoff) {
			m.ob.Cancel(id)
			delete(m.filledSizes, id)
			delete(m.humanOrders, id)
			purged++
		}
	}
	return purged
}

func nowMs() int64 {
	return time.Now().UnixMilli()
}

func minF(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func maxF(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
