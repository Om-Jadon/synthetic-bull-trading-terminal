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
	S0     float64 // initial price
	Mu     float64 // drift (0.0 = fair market)
	Sigma  float64 // volatility (e.g. 0.02)
	TickMs int     // milliseconds between ticks (10 = ~100 orders/sec)
}

// DefaultConfig matches the spec parameters.
func DefaultConfig() Config {
	return Config{S0: 100.0, Mu: 0.0, Sigma: 0.02, TickMs: 10}
}

// Generator runs the GBM process and pushes limit orders into inChan.
// Call Run in a separate goroutine.
type Generator struct {
	cfg    Config
	inChan chan<- *engine.Order
	price  float64
	t      float64 // accumulated time in seconds
	seq    int
}

func New(cfg Config, inChan chan<- *engine.Order) *Generator {
	return &Generator{cfg: cfg, inChan: inChan, price: cfg.S0}
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

	mid := g.price
	numBids := 1 + rand.IntN(2) // 1–2 orders per side → ~20–40 msgs/sec at default tick
	numAsks := 1 + rand.IntN(2)

	for i := 0; i < numBids; i++ {
		offset := rand.Float64() * 0.005 // 0–0.5% below mid
		price := roundTo2(mid * (1 - offset))
		size := 1.0 + rand.Float64()*49.0
		g.emit(engine.Buy, price, size)
	}
	for i := 0; i < numAsks; i++ {
		offset := rand.Float64() * 0.005
		price := roundTo2(mid * (1 + offset))
		size := 1.0 + rand.Float64()*49.0
		g.emit(engine.Sell, price, size)
	}
}

func (g *Generator) emit(side engine.Side, price, size float64) {
	g.seq++
	o := &engine.Order{
		ID:        fmt.Sprintf("sys_%d", g.seq),
		Type:      engine.TypeLimit,
		Side:      side,
		Price:     price,
		Size:      size,
		Remaining: size,
		UserID:    "system",
		CreatedAt: time.Now(),
	}
	select {
	case g.inChan <- o:
	default:
		log.Printf("WARN: generator dropped order (channel full)")
	}
}

func roundTo2(f float64) float64 {
	return math.Round(f*100) / 100
}
