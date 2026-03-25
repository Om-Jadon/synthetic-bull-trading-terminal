package engine

import (
	"time"

	"github.com/google/uuid"
)

// Matcher owns the order book and runs matching logic.
// Must be called from a single goroutine only.
type Matcher struct {
	ob          *OrderBook
	filledSizes map[string]float64 // tracks total filled per human order ID
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
	// Check before cancel — filledSizes is initialized for all human orders
	filled, isHumanOrder := m.filledSizes[o.ID]
	ok := m.ob.Cancel(o.ID)
	if !ok || !isHumanOrder {
		return nil, nil
	}
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
		m.filledSizes[o.ID] = 0 // initialize so cancel can detect human orders
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
			if o.Remaining <= 0 {
				break
			}
		}
	}
	return trades, updates
}

// Depth delegates to the order book for snapshot broadcast.
func (m *Matcher) Depth(n int) (bids, asks [][2]float64) {
	return m.ob.Depth(n)
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
