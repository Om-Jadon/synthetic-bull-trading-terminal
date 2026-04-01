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
	mu            sync.RWMutex
	ob            *OrderBook
	filledSizes   map[string]float64 // cumulative filled size per tracked order ID
	restingOrders map[string]*Order  // all resting orders (human + bots), for cancel metadata
}

func NewMatcher() *Matcher {
	return &Matcher{
		ob:            NewOrderBook(),
		filledSizes:   make(map[string]float64),
		restingOrders: make(map[string]*Order),
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
	orig, isTracked := m.restingOrders[o.ID]
	if !isTracked {
		return nil, nil
	}
	filled := m.filledSizes[o.ID]
	ok := m.ob.Cancel(o.ID)
	delete(m.filledSizes, o.ID)
	delete(m.restingOrders, o.ID)
	if !ok {
		return nil, nil
	}
	// Only emit OrderUpdate for human orders (bots don't consume WS updates)
	if orig.UserID != "human" {
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

	// Track all non-system resting orders for cancel support.
	// System (GBM) orders are never tracked — they cannot be cancelled.
	isSystem := o.UserID == "system"
	if !isSystem {
		m.filledSizes[o.ID] = 0
		m.restingOrders[o.ID] = o
	}

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
	} else {
		// Fully filled as taker — clean up tracking
		delete(m.filledSizes, o.ID)
		delete(m.restingOrders, o.ID)
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
	// Market orders never rest
	delete(m.filledSizes, o.ID)
	delete(m.restingOrders, o.ID)
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
				ID:           "t_" + uuid.NewString(),
				Price:        fillPrice,
				Size:         fillSize,
				BuyOrderID:   o.ID,
				SellOrderID:  maker.ID,
				AggressorSide: Buy,
				BuyerUserID:  o.UserID,
				SellerUserID: snaps[i].userID,
				Ts:           nowMs(),
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
			// Account for maker fill and clean up tracking (only if tracked, i.e. not system)
			if orig, tracked := m.restingOrders[snaps[i].id]; tracked {
				m.filledSizes[snaps[i].id] += fillSize
				filled := m.filledSizes[snaps[i].id]
				remaining := orig.Size - filled
				if remaining <= 0 {
					delete(m.filledSizes, snaps[i].id)
					delete(m.restingOrders, snaps[i].id)
				}
				// Only emit WS update for human makers
				if makerIsHuman {
					status := StatusPartial
					if remaining <= 0 {
						status = StatusFilled
					}
					updates = append(updates, &OrderUpdate{
						OrderID:       snaps[i].id,
						Status:        status,
						FilledSize:    filled,
						RemainingSize: maxF(0, remaining),
						Price:         orig.Price,
						Side:          orig.Side,
						Ts:            nowMs(),
					})
				}
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
				ID:           "t_" + uuid.NewString(),
				Price:        fillPrice,
				Size:         fillSize,
				BuyOrderID:   maker.ID,
				SellOrderID:  o.ID,
				AggressorSide: Sell,
				BuyerUserID:  snaps[i].userID,
				SellerUserID: o.UserID,
				Ts:           nowMs(),
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
			// Account for maker fill and clean up tracking (only if tracked, i.e. not system)
			if orig, tracked := m.restingOrders[snaps[i].id]; tracked {
				m.filledSizes[snaps[i].id] += fillSize
				filled := m.filledSizes[snaps[i].id]
				remaining := orig.Size - filled
				if remaining <= 0 {
					delete(m.filledSizes, snaps[i].id)
					delete(m.restingOrders, snaps[i].id)
				}
				// Only emit WS update for human makers
				if makerIsHuman {
					status := StatusPartial
					if remaining <= 0 {
						status = StatusFilled
					}
						updates = append(updates, &OrderUpdate{
						OrderID:       snaps[i].id,
						Status:        status,
						FilledSize:    filled,
						RemainingSize: maxF(0, remaining),
						Price:         orig.Price,
						Side:          orig.Side,
						Ts:            nowMs(),
					})
				}
			}
			if o.Remaining <= 0 {
				break
			}
		}
	}
	return trades, updates
}

// OpenHumanOrders returns all resting human orders as order_update records.
// Used to restore open orders on client reconnect. Safe to call concurrently.
func (m *Matcher) OpenHumanOrders() []map[string]any {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []map[string]any
	for id, o := range m.restingOrders {
		if o.UserID != "human" {
			continue
		}
		out = append(out, map[string]any{
			"type":           "order_update",
			"order_id":       id,
			"status":         "open",
			"filled_size":    m.filledSizes[id],
			"remaining_size": o.Remaining,
			"price":          o.Price,
			"side":           string(o.Side),
			"ts":             o.CreatedAt.UnixMilli(),
		})
	}
	return out
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
	for id, o := range m.restingOrders {
		if o.UserID != "human" {
			continue
		}
		if o.CreatedAt.Before(cutoff) {
			m.ob.Cancel(id)
			delete(m.filledSizes, id)
			delete(m.restingOrders, id)
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
