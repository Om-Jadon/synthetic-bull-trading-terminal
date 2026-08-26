package engine

import (
	"encoding/json"
	"math/rand/v2"
	"strconv"
	"testing"
)

// Same work as the matching loop in cmd/server/main.go: Process, candles,
// portfolio updates, and JSON for outbound trade/order_update frames.
func BenchmarkPipeline_EndToEnd(b *testing.B) {
	m := NewMatcher()
	cs := NewCandleStore(100)
	registry := NewRegistry("market_maker", "alpha_bot")
	rng := rand.New(rand.NewPCG(7, 11))
	var resting []string
	mid := 100.0

	process := func(id string, typ OrderType, side Side, price, size float64, userID string) {
		o := benchOrder(id, typ, side, price, size, userID)
		trades, updates := m.Process(o)
		for _, t := range trades {
			cs.OnTrade(t.Price, t.Size, string(t.AggressorSide))
			if p := registry.Get(t.BuyerUserID); p != nil {
				p.OnTrade(t, true)
			}
			if p := registry.Get(t.SellerUserID); p != nil {
				p.OnTrade(t, false)
			}
			json.Marshal(map[string]any{ //nolint:errcheck
				"type": "trade", "id": t.ID, "price": t.Price,
				"size": t.Size, "side": t.AggressorSide, "ts": t.Ts,
			})
		}
		for _, u := range updates {
			json.Marshal(map[string]any{ //nolint:errcheck
				"type": "order_update", "order_id": u.OrderID, "status": u.Status,
				"filled_size": u.FilledSize, "remaining_size": u.RemainingSize,
				"price": u.Price, "side": u.Side, "ts": u.Ts,
			})
		}
	}

	registry.GetOrCreate("human")

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
			process(id, TypeCancel, "", 0, 0, "")
		case u < 0.25:
			side := Buy
			if rng.Float64() < 0.5 {
				side = Sell
			}
			process("mkt_"+strconv.Itoa(i), TypeMarket, side, 0, 1, "human")
		default:
			side := Buy
			offset := 0.05 + rng.Float64()*1.5
			price := mid - offset
			if rng.Float64() < 0.5 {
				side = Sell
				price = mid + offset
			}
			id := "lim_" + strconv.Itoa(i)
			process(id, TypeLimit, side, round2(price), 5, "system")
			if len(resting) < 150 {
				resting = append(resting, id)
			}
		}
	}
}
