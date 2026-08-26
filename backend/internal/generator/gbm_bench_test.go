package generator

import (
	"context"
	"io"
	"log"
	"testing"
	"time"

	"github.com/Om-Jadon/synthetic-bull-trading-terminal/backend/internal/engine"
)

func init() {
	log.SetOutput(io.Discard)
}

func BenchmarkGenerator_Tick(b *testing.B) {
	inChan := make(chan *engine.Order, 4096)
	go func() {
		for range inChan {
		}
	}()
	g := New(Config{S0: 100, Sigma: 0.015, TickMs: 10, TargetMsgsPerSec: 200, CancelShare: 0.20, MarketOrderShare: 0.05, MaxResting: 150}, inChan)
	dt := 0.01

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		g.tick(dt)
	}
}

// Unthrottled tick loop — how fast can we emit if the ticker isn't pacing us.
func BenchmarkGenerator_TickHighLoad(b *testing.B) {
	inChan := make(chan *engine.Order, 1<<20)
	go func() {
		for range inChan {
		}
	}()
	g := New(Config{S0: 100, Sigma: 0.015, TickMs: 10, TargetMsgsPerSec: 1_000_000, CancelShare: 0.20, MarketOrderShare: 0.05, MaxResting: 100_000}, inChan)
	dt := 0.01

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		g.tick(dt)
	}
}

func TestGenerator_SustainedRateMatchesConfig(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping wall-clock rate test in -short mode")
	}
	const target = 200
	inChan := make(chan *engine.Order, 4096)
	count := 0
	done := make(chan struct{})
	go func() {
		for range inChan {
			count++
		}
		close(done)
	}()

	g := New(Config{S0: 100, Sigma: 0.015, TickMs: 10, TargetMsgsPerSec: target, CancelShare: 0.20, MarketOrderShare: 0.05, MaxResting: 150}, inChan)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	start := time.Now()
	g.Run(ctx)
	elapsed := time.Since(start)
	close(inChan)
	<-done

	rate := float64(count) / elapsed.Seconds()
	t.Logf("generator sustained %.1f msgs/sec over %v (target %d/sec)", rate, elapsed, target)
	if rate < float64(target)*0.9 || rate > float64(target)*1.1 {
		t.Errorf("sustained rate %.1f/sec deviates >10%% from target %d/sec", rate, target)
	}
}
