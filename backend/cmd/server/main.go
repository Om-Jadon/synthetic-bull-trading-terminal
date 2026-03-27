package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/nextbull/trading-terminal/internal/api"
	"github.com/nextbull/trading-terminal/internal/engine"
	"github.com/nextbull/trading-terminal/internal/generator"
	"github.com/nextbull/trading-terminal/internal/hub"
)

func main() {
	cfg := generator.Config{
		S0:     envFloat("GBM_S0", 100.0),
		Mu:     envFloat("GBM_MU", 0.0),
		Sigma:  envFloat("GBM_SIGMA", 0.02),
		TickMs: envInt("GBM_TICK_MS", 50),
	}
	port := envStr("BACKEND_PORT", "8080")

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	inChan := make(chan *engine.Order, 1024)

	matcher := engine.NewMatcher()
	candleStore := engine.NewCandleStore(cfg.S0)
	portfolio := engine.NewPortfolio(100_000.0) // $100k starting capital
	wsHub := hub.New()

	var ready atomic.Bool

	handlers := api.New(inChan, portfolio, func() float64 { return candleStore.Stats().LastPrice })

	// Snapshot function — called on each new WS connection
	snapshotFn := func() []byte {
		bids, asks := matcher.Depth(20)
		snap := map[string]any{
			"type": "snapshot",
			"book": map[string]any{
				"bids": bids,
				"asks": asks,
				"ts":   time.Now().UnixMilli(),
			},
			"candles":   candleStore.Snapshot(300),
			"portfolio": portfolio.State(candleStore.Stats().LastPrice),
			"ts":        time.Now().UnixMilli(),
		}
		b, _ := json.Marshal(snap)
		return b
	}

	// HTTP router
	mux := http.NewServeMux()
	mux.HandleFunc("POST /orders", handlers.PostOrder)
	mux.HandleFunc("DELETE /orders/{id}", handlers.DeleteOrder)
	mux.HandleFunc("GET /candles", api.GetCandles(func(n int) any {
		return candleStore.Snapshot(n)
	}))
	mux.HandleFunc("GET /health", api.HealthHandler(func() bool { return ready.Load() }))
	mux.HandleFunc("GET /ws", func(w http.ResponseWriter, r *http.Request) {
		wsHub.ServeWS(w, r, snapshotFn)
	})

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: api.CORS(mux),
	}

	// 1. WebSocket hub goroutine
	go wsHub.Run(ctx)

	// 2. Matching engine goroutine (single goroutine — owns all state, no mutexes on hot path)
	go func() {
		ready.Store(true)
		bookTicker := time.NewTicker(100 * time.Millisecond)
		statsTicker := time.NewTicker(1 * time.Second)
		defer bookTicker.Stop()
		defer statsTicker.Stop()

		for {
			select {
			case <-ctx.Done():
				return

			case o := <-inChan:
				trades, updates := matcher.Process(o)
				for _, t := range trades {
					candleStore.OnTrade(t.Price, t.Size)
					portfolio.OnTrade(t)
					msg, _ := json.Marshal(map[string]any{
						"type":  "trade",
						"id":    t.ID,
						"price": t.Price,
						"size":  t.Size,
						"side":  t.AggressorSide,
						"ts":    t.Ts,
					})
					wsHub.Broadcast(msg)
				}
				for _, u := range updates {
					msg, _ := json.Marshal(map[string]any{
						"type":           "order_update",
						"order_id":       u.OrderID,
						"status":         u.Status,
						"filled_size":    u.FilledSize,
						"remaining_size": u.RemainingSize,
						"price":          u.Price,
						"side":           u.Side,
						"ts":             u.Ts,
					})
					wsHub.Broadcast(msg)
					// Send portfolio update after fills
					if u.Status == engine.StatusPartial || u.Status == engine.StatusFilled {
						pState := portfolio.State(candleStore.Stats().LastPrice)
						pmsg, _ := json.Marshal(pState)
						wsHub.Broadcast(pmsg)
					}
				}

			case <-bookTicker.C:
				if purged := matcher.PurgeStaleHumanOrders(30 * time.Minute); purged > 0 {
					log.Printf("purged %d stale human orders (no fill/cancel in 30min)", purged)
				}
				bids, asks := matcher.Depth(20)
				msg, _ := json.Marshal(map[string]any{
					"type": "book",
					"bids": bids,
					"asks": asks,
					"ts":   time.Now().UnixMilli(),
				})
				wsHub.Broadcast(msg)

			case <-statsTicker.C:
				stats := candleStore.Stats()
				msg, _ := json.Marshal(map[string]any{
					"type":           "stats",
					"session_open":   stats.SessionOpen,
					"session_high":   stats.SessionHigh,
					"session_low":    stats.SessionLow,
					"last_price":     stats.LastPrice,
					"session_volume": stats.SessionVolume,
					"change_pct":     stats.ChangePct,
					"ts":             stats.Ts,
				})
				wsHub.Broadcast(msg)
			}
		}
	}()

	// 3. GBM generator goroutine
	gen := generator.New(cfg, inChan)
	go gen.Run(ctx)

	// 4. HTTP server
	go func() {
			log.Printf("SYNTHETIC-BULL backend listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down...")
	shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutCancel()
	srv.Shutdown(shutCtx)
}

func envFloat(key string, def float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return def
}

func envStr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
