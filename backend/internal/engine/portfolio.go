package engine

import (
	"math"
	"sync"
	"time"
)

const holdingsEpsilon = 1e-9

const (
	maxEquityPoints  = 600
	maxFills         = 200
	maxActivityItems = 200
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

	equityBuf    [maxEquityPoints]EquityPoint
	equityHead   int
	equityLen    int
	fillBuf      [maxFills]FillRecord
	fillHead     int
	fillLen      int
	activityBuf  [maxActivityItems]ActivityRecord
	activityHead int
	activityLen  int
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
			if p.holdings > holdingsEpsilon {
				// Flipped to long — reset avg entry to the new long price
				p.avgEntry = t.Price
			} else if math.Abs(p.holdings) <= holdingsEpsilon {
				p.holdings = 0
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
			if p.holdings < -holdingsEpsilon {
				// Flipped to short — reset avg entry to the new short price
				p.avgEntry = t.Price
			} else if math.Abs(p.holdings) <= holdingsEpsilon {
				p.holdings = 0
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

	// fill log — runs inside the existing p.mu.Lock() scope
	side := Sell
	if t.HumanIsBuyer {
		side = Buy
	}
	fidx := (p.fillHead + p.fillLen) % maxFills
	p.fillBuf[fidx] = FillRecord{Ts: t.Ts, Price: t.Price, Side: side}
	if p.fillLen < maxFills {
		p.fillLen++
	} else {
		p.fillHead = (p.fillHead + 1) % maxFills
	}
}

// RecordEquity appends a new equity point. Call from main.go after fills (acquires its own lock).
func (p *Portfolio) RecordEquity(lastPrice float64) {
	p.mu.Lock()
	defer p.mu.Unlock()
	equity := p.cash + p.holdings*lastPrice
	idx := (p.equityHead + p.equityLen) % maxEquityPoints
	p.equityBuf[idx] = EquityPoint{Ts: time.Now().UnixMilli(), Value: round2(equity)}
	if p.equityLen < maxEquityPoints {
		p.equityLen++
	} else {
		p.equityHead = (p.equityHead + 1) % maxEquityPoints
	}
}

// EquityHistory returns the equity curve in chronological order. Thread-safe.
func (p *Portfolio) EquityHistory() []EquityPoint {
	p.mu.RLock()
	defer p.mu.RUnlock()
	out := make([]EquityPoint, p.equityLen)
	for i := 0; i < p.equityLen; i++ {
		out[i] = p.equityBuf[(p.equityHead+i)%maxEquityPoints]
	}
	return out
}

// FillLog returns the fill history in chronological order. Thread-safe.
func (p *Portfolio) FillLog() []FillRecord {
	p.mu.RLock()
	defer p.mu.RUnlock()
	out := make([]FillRecord, p.fillLen)
	for i := 0; i < p.fillLen; i++ {
		out[i] = p.fillBuf[(p.fillHead+i)%maxFills]
	}
	return out
}

// RecordActivity appends an order lifecycle event to the activity log.
func (p *Portfolio) RecordActivity(rec ActivityRecord) {
	p.mu.Lock()
	defer p.mu.Unlock()
	idx := (p.activityHead + p.activityLen) % maxActivityItems
	p.activityBuf[idx] = rec
	if p.activityLen < maxActivityItems {
		p.activityLen++
	} else {
		p.activityHead = (p.activityHead + 1) % maxActivityItems
	}
}

// ActivityLog returns the activity log in chronological order. Thread-safe.
func (p *Portfolio) ActivityLog() []ActivityRecord {
	p.mu.RLock()
	defer p.mu.RUnlock()
	out := make([]ActivityRecord, p.activityLen)
	for i := 0; i < p.activityLen; i++ {
		out[i] = p.activityBuf[(p.activityHead+i)%maxActivityItems]
	}
	return out
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
