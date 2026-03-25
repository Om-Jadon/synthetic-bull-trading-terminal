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
