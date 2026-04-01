package generator

import (
	"context"
	"fmt"
	"log"
	"math"
	"math/rand/v2"
	"time"

	"github.com/nextbull/trading-terminal/internal/engine"
)

// Config holds GBM parameters.
type Config struct {
	S0               float64 // initial price
	Mu               float64 // drift (0.0 = fair market)
	Sigma            float64 // volatility (e.g. 0.02)
	TickMs           int     // milliseconds between ticks
	TargetMsgsPerSec int     // total synthetic messages/second (limits + cancels + markets)
	CancelShare      float64 // share of messages used for cancel flow
	MarketOrderShare float64 // share of messages used for market orders
	MaxResting       int     // cap on tracked system resting orders for cancellation
}

// DefaultConfig matches the spec parameters.
func DefaultConfig() Config {
	return Config{
		S0:               100.0,
		Mu:               0.0,
		Sigma:            0.015,
		TickMs:           10,
		TargetMsgsPerSec: 200,
		CancelShare:      0.10,
		MarketOrderShare: 0.05,
		MaxResting:       600,
	}
}

// Generator runs the GBM process and pushes limit orders into inChan.
// Call Run in a separate goroutine.
type Generator struct {
	cfg             Config
	inChan          chan<- *engine.Order
	price           float64
	anchor          float64
	t               float64 // accumulated time in seconds
	seq             int
	msgBudget       float64
	restingOrderIDs []string
}

func New(cfg Config, inChan chan<- *engine.Order) *Generator {
	if cfg.Sigma <= 0 {
		cfg.Sigma = 0.015
	}
	if cfg.TargetMsgsPerSec <= 0 {
		cfg.TargetMsgsPerSec = 200
	}
	if cfg.TickMs <= 0 {
		cfg.TickMs = 10
	}
	if cfg.MaxResting <= 0 {
		cfg.MaxResting = 600
	}
	if cfg.CancelShare < 0 {
		cfg.CancelShare = 0
	}
	if cfg.MarketOrderShare < 0 {
		cfg.MarketOrderShare = 0
	}
	if cfg.CancelShare+cfg.MarketOrderShare > 0.35 {
		scale := 0.35 / (cfg.CancelShare + cfg.MarketOrderShare)
		cfg.CancelShare *= scale
		cfg.MarketOrderShare *= scale
	}
	return &Generator{cfg: cfg, inChan: inChan, price: cfg.S0, anchor: cfg.S0}
}

// Run blocks until ctx is cancelled.
func (g *Generator) Run(ctx context.Context) {
	dt := float64(g.cfg.TickMs) / 1000.0
	ticker := time.NewTicker(time.Duration(g.cfg.TickMs) * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			g.tick(dt)
		}
	}
}

func (g *Generator) tick(dt float64) {
	// GBM step: S_{t+dt} = S_t * exp((mu - sigma^2/2)*dt + sigma*sqrt(dt)*Z)
	z := rand.NormFloat64()
	g.price *= math.Exp((g.cfg.Mu-0.5*g.cfg.Sigma*g.cfg.Sigma)*dt +
		g.cfg.Sigma*math.Sqrt(dt)*z)
	g.t += dt

	// Soft anchor prevents sustained one-way drift while keeping each run stochastic.
	g.anchor = 0.995*g.anchor + 0.005*g.price
	if g.anchor > 0 {
		distance := (g.price - g.anchor) / g.anchor
		g.price *= math.Exp(-0.08 * distance * dt)
	}

	g.msgBudget += float64(g.cfg.TargetMsgsPerSec) * dt
	events := int(g.msgBudget)
	if events <= 0 {
		return
	}
	g.msgBudget -= float64(events)

	for i := 0; i < events; i++ {
		u := rand.Float64()
		switch {
		case len(g.restingOrderIDs) > 0 && u < g.cfg.CancelShare:
			g.emitCancel()
		case u < g.cfg.CancelShare+g.cfg.MarketOrderShare:
			g.emitMarketOrder()
		default:
			g.emitPassiveLimit()
		}
	}
}

func (g *Generator) emitPassiveLimit() {
	if len(g.restingOrderIDs) >= g.cfg.MaxResting {
		g.emitCancel()
		return
	}

	mid := g.price
	buyProb := g.buyProbability()
	side := engine.Sell
	if rand.Float64() < buyProb {
		side = engine.Buy
	}
	offset := 0.00005 + rand.Float64()*0.0015
	price := mid * (1 + offset)
	if side == engine.Buy {
		price = mid * (1 - offset)
	}
	size := 2.0 + rand.Float64()*18.0

	g.seq++
	id := fmt.Sprintf("sys_%d", g.seq)
	o := &engine.Order{
		ID:        id,
		Type:      engine.TypeLimit,
		Side:      side,
		Price:     roundTo2(price),
		Size:      size,
		Remaining: size,
		UserID:    "system",
		CreatedAt: time.Now(),
	}
	if g.emitOrder(o) {
		g.restingOrderIDs = append(g.restingOrderIDs, id)
	}
}

func (g *Generator) emitMarketOrder() {
	buyProb := g.buyProbability()
	side := engine.Sell
	if rand.Float64() < buyProb {
		side = engine.Buy
	}
	size := 0.25 + rand.Float64()*1.75
	g.seq++
	o := &engine.Order{
		ID:        fmt.Sprintf("sys_%d", g.seq),
		Type:      engine.TypeMarket,
		Side:      side,
		Price:     0,
		Size:      size,
		Remaining: size,
		UserID:    "system",
		CreatedAt: time.Now(),
	}
	g.emitOrder(o)
}

func (g *Generator) emitCancel() {
	if len(g.restingOrderIDs) == 0 {
		return
	}
	idx := rand.IntN(len(g.restingOrderIDs))
	id := g.restingOrderIDs[idx]
	last := len(g.restingOrderIDs) - 1
	g.restingOrderIDs[idx] = g.restingOrderIDs[last]
	g.restingOrderIDs = g.restingOrderIDs[:last]

	o := &engine.Order{
		ID:   id,
		Type: engine.TypeCancel,
	}
	g.emitOrder(o)
}

func (g *Generator) emitOrder(o *engine.Order) bool {
	select {
	case g.inChan <- o:
		return true
	default:
		log.Printf("WARN: generator dropped order (channel full)")
		return false
	}
}

func (g *Generator) buyProbability() float64 {
	if g.anchor <= 0 {
		return 0.5
	}
	distance := (g.price - g.anchor) / g.anchor
	prob := 0.5 - 4.0*distance
	if prob < 0.25 {
		return 0.25
	}
	if prob > 0.75 {
		return 0.75
	}
	return prob
}

func roundTo2(f float64) float64 {
	return math.Round(f*100) / 100
}
