package engine

import (
	"strconv"
	"testing"
)

func BenchmarkPortfolio_OnTrade(b *testing.B) {
	p := NewPortfolio("human", 100_000)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		t := &Trade{
			ID:    "t_" + strconv.Itoa(i),
			Price: 100.0,
			Size:  1,
			Ts:    int64(i),
		}
		p.OnTrade(t, i%2 == 0)
	}
}

func BenchmarkPortfolio_State(b *testing.B) {
	p := NewPortfolio("human", 100_000)
	for i := 0; i < 50; i++ {
		p.OnTrade(&Trade{ID: strconv.Itoa(i), Price: 100 + float64(i)*0.01, Size: 1, Ts: int64(i)}, true)
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		p.State(101.0)
	}
}

// One writer + parallel State() readers, roughly like matcher vs hub/bots.
func BenchmarkPortfolio_ConcurrentReadWrite(b *testing.B) {
	p := NewPortfolio("human", 100_000)
	done := make(chan struct{})
	go func() {
		i := 0
		for {
			select {
			case <-done:
				return
			default:
				p.OnTrade(&Trade{ID: strconv.Itoa(i), Price: 100, Size: 1, Ts: int64(i)}, i%2 == 0)
				i++
			}
		}
	}()

	b.ReportAllocs()
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			p.State(100.0)
		}
	})
	b.StopTimer()
	close(done)
}
