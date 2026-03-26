package engine

import (
	"math"
	"sync"
	"time"
)

// Portfolio tracks the human user's cash, holdings, and P&L.
// Thread-safe: reads from HTTP snapshot, writes from matching goroutine.
type Portfolio struct {
	mu           sync.RWMutex
	cash         float64
	holdings     float64 // positive = long, negative = short
	avgEntry     float64 // avg buy price when long; avg sell price when short
	realizedPnl  float64
	startingCash float64
}

func NewPortfolio(startingCash float64) *Portfolio {
	return &Portfolio{cash: startingCash, startingCash: startingCash}
}

// OnTrade updates the portfolio when a trade involving the human occurs.
func (p *Portfolio) OnTrade(t *Trade) {
	if !t.HumanInvolved {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()

	if t.HumanIsBuyer {
		p.cash -= t.Price * t.Size

		if p.holdings < 0 {
			// Covering a short position
			coverSize := math.Min(t.Size, -p.holdings)
			p.realizedPnl += (p.avgEntry - t.Price) * coverSize
			p.holdings += t.Size
			if p.holdings > 0 {
				// Flipped to long — reset avg entry to the new long price
				p.avgEntry = t.Price
			} else if p.holdings == 0 {
				p.avgEntry = 0
			}
			// If still short, avgEntry is unchanged (still the short avg)
		} else {
			// Adding to long or initiating long from flat
			total := p.holdings + t.Size
			p.avgEntry = (p.avgEntry*p.holdings + t.Price*t.Size) / total
			p.holdings += t.Size
		}
	} else {
		// Human is seller
		p.cash += t.Price * t.Size

		if p.holdings > 0 {
			// Closing long position
			closeSize := math.Min(t.Size, p.holdings)
			p.realizedPnl += (t.Price - p.avgEntry) * closeSize
			p.holdings -= t.Size
			if p.holdings < 0 {
				// Flipped to short — reset avg entry to the new short price
				p.avgEntry = t.Price
			} else if p.holdings == 0 {
				p.avgEntry = 0
			}
			// If still long, avgEntry is unchanged
		} else {
			// Adding to short or initiating short from flat
			total := -p.holdings + t.Size
			p.avgEntry = (p.avgEntry*(-p.holdings) + t.Price*t.Size) / total
			p.holdings -= t.Size
		}
	}
}

// State returns a portfolio snapshot for WS broadcast.
func (p *Portfolio) State(lastPrice float64) map[string]any {
	p.mu.RLock()
	defer p.mu.RUnlock()

	unrealizedPnl := 0.0
	if p.holdings > 0 && p.avgEntry > 0 {
		unrealizedPnl = (lastPrice - p.avgEntry) * p.holdings
	} else if p.holdings < 0 && p.avgEntry > 0 {
		unrealizedPnl = (p.avgEntry - lastPrice) * (-p.holdings)
	}

	equity := p.cash + p.holdings*lastPrice
	return map[string]any{
		"type":           "portfolio",
		"cash":           round2(p.cash),
		"holdings":       round2(p.holdings),
		"avg_entry":      round2(p.avgEntry),
		"unrealized_pnl": round2(unrealizedPnl),
		"realized_pnl":   round2(p.realizedPnl),
		"equity":         round2(equity),
		"ts":             time.Now().UnixMilli(),
	}
}

func round2(f float64) float64 {
	return math.Round(f*100) / 100
}
