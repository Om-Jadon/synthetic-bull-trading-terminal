// internal/engine/orderbook_test.go
package engine

import (
	"fmt"
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
