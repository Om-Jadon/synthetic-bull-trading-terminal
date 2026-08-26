package engine

import (
	"fmt"
	"math/rand/v2"
	"strconv"
	"testing"
	"time"
)

func benchOrder(id string, typ OrderType, side Side, price, size float64, userID string) *Order {
	return &Order{
		ID: id, Type: typ, Side: side,
		Price: price, Size: size, Remaining: size,
		UserID: userID, CreatedAt: time.Now(),
	}
}

// Orders that never cross — book insert only.
func BenchmarkMatcher_RestingLimitInsert(b *testing.B) {
	m := NewMatcher()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		side := Buy
		price := 100.0 - float64(i%5000)*0.01
		if i%2 == 1 {
			side = Sell
			price = 100.0 + float64(i%5000)*0.01
		}
		id := "b_" + strconv.Itoa(i)
		m.Process(benchOrder(id, TypeLimit, side, price, 10, "system"))
	}
}

// Every order trades immediately against a resting opposite.
func BenchmarkMatcher_CrossingLimit(b *testing.B) {
	m := NewMatcher()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		askID := "ask_" + strconv.Itoa(i)
		m.Process(benchOrder(askID, TypeLimit, Sell, 100.0, 10, "system"))
		bidID := "bid_" + strconv.Itoa(i)
		m.Process(benchOrder(bidID, TypeLimit, Buy, 100.0, 10, "human"))
	}
}

func BenchmarkMatcher_MarketSweep(b *testing.B) {
	m := NewMatcher()
	for lvl := 0; lvl < 20; lvl++ {
		price := 100.0 + float64(lvl)*0.01
		m.Process(benchOrder(fmt.Sprintf("ask_seed_%d", lvl), TypeLimit, Sell, price, 1000, "system"))
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		id := "mkt_" + strconv.Itoa(i)
		m.Process(benchOrder(id, TypeMarket, Buy, 0, 5, "human"))
		if i%400 == 0 {
			for lvl := 0; lvl < 20; lvl++ {
				price := 100.0 + float64(lvl)*0.01
				m.Process(benchOrder(fmt.Sprintf("ask_%d_%d", i, lvl), TypeLimit, Sell, price, 1000, "system"))
			}
		}
	}
}

// Same mix as the GBM generator defaults: ~75% limit, 20% cancel, 5% market.
func BenchmarkMatcher_RealisticMix(b *testing.B) {
	m := NewMatcher()
	rng := rand.New(rand.NewPCG(1, 2))
	var resting []string
	mid := 100.0

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		u := rng.Float64()
		switch {
		case len(resting) > 0 && u < 0.20:
			idx := rng.IntN(len(resting))
			id := resting[idx]
			resting[idx] = resting[len(resting)-1]
			resting = resting[:len(resting)-1]
			m.Process(&Order{ID: id, Type: TypeCancel})
		case u < 0.25:
			side := Buy
			if rng.Float64() < 0.5 {
				side = Sell
			}
			m.Process(benchOrder("mkt_"+strconv.Itoa(i), TypeMarket, side, 0, 1, "system"))
		default:
			side := Buy
			offset := 0.05 + rng.Float64()*1.5
			price := mid - offset
			if rng.Float64() < 0.5 {
				side = Sell
				price = mid + offset
			}
			id := "lim_" + strconv.Itoa(i)
			m.Process(benchOrder(id, TypeLimit, side, round2(price), 5, "system"))
			if len(resting) < 150 {
				resting = append(resting, id)
			}
		}
	}
}

func BenchmarkOrderBook_Depth(b *testing.B) {
	m := NewMatcher()
	for i := 0; i < 300; i++ {
		side := Buy
		price := 100.0 - float64(i)*0.01
		if i%2 == 1 {
			side = Sell
			price = 100.0 + float64(i)*0.01
		}
		m.Process(benchOrder("seed_"+strconv.Itoa(i), TypeLimit, side, price, 10, "system"))
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		m.Depth(150)
	}
}
