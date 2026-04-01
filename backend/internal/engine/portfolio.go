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

// Portfolio tracks a user's cash, holdings, and P&L.
// Thread-safe: reads from HTTP snapshot/bot goroutines, writes from matching goroutine.
type Portfolio struct {
	mu           sync.RWMutex
	userID       string
	cash         float64
	holdings     float64 // positive = long, negative = short
	avgEntry     float64 // avg buy price when long; avg sell price when short
	realizedPnl  float64
	startingCash float64
	fillCount    int // lifetime fill count, not capped

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

func NewPortfolio(userID string, startingCash float64) *Portfolio {
	return &Portfolio{userID: userID, cash: startingCash, startingCash: startingCash}
}

// OnTrade updates the portfolio when a trade involving this user occurs.
// isBuyer must be true if this portfolio's user is the buyer side of the trade.
func (p *Portfolio) OnTrade(t *Trade, isBuyer bool) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if isBuyer {
		p.cash -= t.Price * t.Size

		if p.holdings < 0 {
			coverSize := math.Min(t.Size, -p.holdings)
			p.realizedPnl += (p.avgEntry - t.Price) * coverSize
			p.holdings += t.Size
			if p.holdings > holdingsEpsilon {
				p.avgEntry = t.Price
			} else if math.Abs(p.holdings) <= holdingsEpsilon {
				p.holdings = 0
				p.avgEntry = 0
			}
		} else {
			total := p.holdings + t.Size
			p.avgEntry = (p.avgEntry*p.holdings + t.Price*t.Size) / total
			p.holdings += t.Size
		}
	} else {
		p.cash += t.Price * t.Size

		if p.holdings > 0 {
			closeSize := math.Min(t.Size, p.holdings)
			p.realizedPnl += (t.Price - p.avgEntry) * closeSize
			p.holdings -= t.Size
			if p.holdings < -holdingsEpsilon {
				p.avgEntry = t.Price
			} else if math.Abs(p.holdings) <= holdingsEpsilon {
				p.holdings = 0
				p.avgEntry = 0
			}
		} else {
			total := -p.holdings + t.Size
			p.avgEntry = (p.avgEntry*(-p.holdings) + t.Price*t.Size) / total
			p.holdings -= t.Size
		}
	}

	side := Sell
	if isBuyer {
		side = Buy
	}
	fidx := (p.fillHead + p.fillLen) % maxFills
	p.fillBuf[fidx] = FillRecord{Ts: t.Ts, Price: t.Price, Side: side, Size: t.Size}
	if p.fillLen < maxFills {
		p.fillLen++
	} else {
		p.fillHead = (p.fillHead + 1) % maxFills
	}
	p.fillCount++
}

// Holdings returns the current net position. Thread-safe.
func (p *Portfolio) Holdings() float64 {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.holdings
}

// Cash returns the current cash balance. Thread-safe.
func (p *Portfolio) Cash() float64 {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.cash
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

	// Last 15 fills in chronological order
	fillCount := p.fillLen
	if fillCount > 15 {
		fillCount = 15
	}
	startIdx := p.fillLen - fillCount
	recentFills := make([]FillRecord, fillCount)
	for i := 0; i < fillCount; i++ {
		recentFills[i] = p.fillBuf[(p.fillHead+startIdx+i)%maxFills]
	}

	return map[string]any{
		"type":           "portfolio",
		"user_id":        p.userID,
		"cash":           round2(p.cash),
		"holdings":       round2(p.holdings),
		"avg_entry":      round2(p.avgEntry),
		"unrealized_pnl": round2(unrealizedPnl),
		"realized_pnl":   round2(p.realizedPnl),
		"equity":         round2(equity),
		"recent_fills":   recentFills,
		"fill_count":     p.fillCount,
		"ts":             time.Now().UnixMilli(),
	}
}

func round2(f float64) float64 {
	return math.Round(f*100) / 100
}
