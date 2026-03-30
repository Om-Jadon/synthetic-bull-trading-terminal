package engine

import (
	"testing"
)

func TestCandleStore_TradeCount(t *testing.T) {
	cs := NewCandleStore(100.0)
	if cs.Stats().TradeCount != 0 {
		t.Fatal("expected 0 initial trade count")
	}
	cs.OnTrade(100.5, 2.0, "buy")
	cs.OnTrade(101.0, 3.0, "sell")
	if cs.Stats().TradeCount != 2 {
		t.Fatalf("expected 2, got %d", cs.Stats().TradeCount)
	}
}

func TestCandleStore_VWAP(t *testing.T) {
	cs := NewCandleStore(100.0)
	if cs.Stats().VWAP != 0 {
		t.Fatal("expected 0 initial VWAP")
	}
	cs.OnTrade(100.0, 2.0, "buy")
	cs.OnTrade(110.0, 3.0, "sell")
	// VWAP = (100*2 + 110*3) / (2+3) = 530/5 = 106.0
	got := cs.Stats().VWAP
	if got < 105.99 || got > 106.01 {
		t.Fatalf("expected ~106.0, got %f", got)
	}
}
