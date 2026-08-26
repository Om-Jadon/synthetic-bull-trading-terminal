package generator

import (
	"testing"

	"github.com/Om-Jadon/synthetic-bull-trading-terminal/backend/internal/engine"
)

func TestTick_RespectsTargetMessageRate(t *testing.T) {
	in := make(chan *engine.Order, 10_000)
	cfg := Config{
		S0:             100,
		Mu:             0,
		Sigma:          0.02,
		TickMs:         10,
		TargetMsgsPerSec: 200,
		CancelShare:    0.25,
		MarketOrderShare: 0.12,
	}
	g := New(cfg, in)

	for i := 0; i < 100; i++ { // 1 second at 10ms ticks
		g.tick(0.01)
	}

	got := len(in)
	if got < 160 || got > 240 {
		t.Fatalf("expected about 200 msgs/sec, got %d", got)
	}
}

func TestTick_GeneratesCancelAndMarketFlow(t *testing.T) {
	in := make(chan *engine.Order, 10_000)
	cfg := Config{
		S0:               100,
		Mu:               0,
		Sigma:            0.02,
		TickMs:           10,
		TargetMsgsPerSec: 200,
		CancelShare:      0.30,
		MarketOrderShare: 0.30,
	}
	g := New(cfg, in)

	for i := 0; i < 300; i++ {
		g.tick(0.01)
	}

	var cancels, markets int
	for len(in) > 0 {
		o := <-in
		switch o.Type {
		case engine.TypeCancel:
			cancels++
		case engine.TypeMarket:
			markets++
		}
	}

	if cancels == 0 {
		t.Fatalf("expected generator to emit cancel orders")
	}
	if markets == 0 {
		t.Fatalf("expected generator to emit market orders")
	}
}
