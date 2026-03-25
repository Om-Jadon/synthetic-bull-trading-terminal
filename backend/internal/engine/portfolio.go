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
	holdings     float64
	avgEntry     float64
	realizedPnl  float64
	startingCash float64
}

func NewPortfolio(startingCash float64) *Portfolio {
	return &Portfolio{cash: startingCash, startingCash: startingCash}
}

// OnTrade updates the portfolio when a trade occurs.
// Uses t.HumanInvolved and t.HumanIsBuyer for correct maker/taker tracking.
func (p *Portfolio) OnTrade(t *Trade) {
	if !t.HumanInvolved {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()

	if t.HumanIsBuyer {
		// Human bought: spend cash, gain BULL
		cost := t.Price * t.Size
		p.cash -= cost
		totalHoldings := p.holdings + t.Size
		if totalHoldings > 0 {
			p.avgEntry = (p.avgEntry*p.holdings + t.Price*t.Size) / totalHoldings
		}
		p.holdings += t.Size
	} else {
		// Human sold: gain cash, reduce BULL
		proceeds := t.Price * t.Size
		if p.holdings > 0 {
			p.realizedPnl += (t.Price - p.avgEntry) * t.Size
		}
		p.cash += proceeds
		p.holdings -= t.Size
		if p.holdings <= 0 {
			p.holdings = 0
			p.avgEntry = 0
		}
	}
}

// State returns a portfolio snapshot for WS broadcast.
// lastPrice is needed to compute unrealized P&L and equity.
func (p *Portfolio) State(lastPrice float64) map[string]any {
	p.mu.RLock()
	defer p.mu.RUnlock()

	unrealizedPnl := 0.0
	if p.holdings > 0 && p.avgEntry > 0 {
		unrealizedPnl = (lastPrice - p.avgEntry) * p.holdings
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
