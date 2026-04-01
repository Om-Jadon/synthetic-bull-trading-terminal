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
	"github.com/nextbull/trading-terminal/internal/bots"
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
	mmPriceCh := make(chan float64, 1)
	abCandleCh := make(chan engine.Candle, 10)

	matcher := engine.NewMatcher()
	candleStore := engine.NewCandleStore(cfg.S0)
	registry := engine.NewRegistry("human", "market_maker", "alpha_bot")
	wsHub := hub.New()

	var ready atomic.Bool

	handlers := api.New(inChan, registry.Get("human"), func() float64 { return candleStore.Stats().LastPrice })

	// Snapshot function — called on each new WS connection
	snapshotFn := func() []byte {
		bids, asks := matcher.Depth(150)
		currentStats := candleStore.Stats()
		humanPortfolio := registry.Get("human")
		snap := map[string]any{
			"type": "snapshot",
			"book": map[string]any{
				"bids": bids,
				"asks": asks,
				"ts":   time.Now().UnixMilli(),
			},
			"candles":   candleStore.Snapshot(300),
			"portfolio": humanPortfolio.State(currentStats.LastPrice),
			"stats": map[string]any{
				"type":           "stats",
				"session_open":   currentStats.SessionOpen,
				"session_high":   currentStats.SessionHigh,
				"session_low":    currentStats.SessionLow,
				"last_price":     currentStats.LastPrice,
				"session_volume": currentStats.SessionVolume,
				"change_pct":     currentStats.ChangePct,
				"trade_count":    currentStats.TradeCount,
				"vwap":           currentStats.VWAP,
				"ts":             currentStats.Ts,
			},
			"recent_trades":  candleStore.RecentTrades(),
			"equity_history": humanPortfolio.EquityHistory(),
			"fills":          humanPortfolio.FillLog(),
			"activity_log":   humanPortfolio.ActivityLog(),
			"open_orders":    matcher.OpenHumanOrders(),
			"ts":             time.Now().UnixMilli(),
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
					candleStore.OnTrade(t.Price, t.Size, string(t.AggressorSide))
					if p := registry.Get(t.BuyerUserID); p != nil {
						p.OnTrade(t, true)
					}
					if p := registry.Get(t.SellerUserID); p != nil {
						p.OnTrade(t, false)
					}
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
				humanPortfolio := registry.Get("human")
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
					// record every human order lifecycle event for the activity log
					humanPortfolio.RecordActivity(engine.ActivityRecord{
						OrderID:       u.OrderID,
						Status:        u.Status,
						FilledSize:    u.FilledSize,
						RemainingSize: u.RemainingSize,
						Price:         u.Price,
						Side:          u.Side,
						Ts:            u.Ts,
					})
					// Send human portfolio update after fills
					if u.Status == engine.StatusPartial || u.Status == engine.StatusFilled {
						lastPrice := candleStore.Stats().LastPrice
						humanPortfolio.RecordEquity(lastPrice)
						pmsg, _ := json.Marshal(humanPortfolio.State(lastPrice))
						wsHub.Broadcast(pmsg)
					}
				}

			case <-bookTicker.C:
				if purged := matcher.PurgeStaleHumanOrders(30 * time.Minute); purged > 0 {
					log.Printf("purged %d stale human orders (no fill/cancel in 30min)", purged)
				}
				bids, asks := matcher.Depth(150)
				msg, _ := json.Marshal(map[string]any{
					"type": "book",
					"bids": bids,
					"asks": asks,
					"ts":   time.Now().UnixMilli(),
				})
				wsHub.Broadcast(msg)

			case <-statsTicker.C:
				stats := candleStore.Stats()
				// Fan out price to market maker
				select {
				case mmPriceCh <- stats.LastPrice:
				default:
				}
				// Fan out completed candle to alpha bot
				if snaps := candleStore.Snapshot(1); len(snaps) > 0 {
					select {
					case abCandleCh <- snaps[0]:
					default:
					}
				}
				// Broadcast stats
				msg, _ := json.Marshal(map[string]any{
					"type":           "stats",
					"session_open":   stats.SessionOpen,
					"session_high":   stats.SessionHigh,
					"session_low":    stats.SessionLow,
					"last_price":     stats.LastPrice,
					"session_volume": stats.SessionVolume,
					"change_pct":     stats.ChangePct,
					"trade_count":    stats.TradeCount,
					"vwap":           stats.VWAP,
					"ts":             stats.Ts,
				})
				wsHub.Broadcast(msg)
				// Broadcast all 3 portfolio states
				for _, p := range registry.All() {
					p.RecordEquity(stats.LastPrice)
					pmsg, _ := json.Marshal(p.State(stats.LastPrice))
					wsHub.Broadcast(pmsg)
				}
			}
		}
	}()

	// 3. GBM generator goroutine
	gen := generator.New(cfg, inChan)
	go gen.Run(ctx)

	// 4. Bot goroutines
	go bots.RunMarketMaker(ctx, inChan, mmPriceCh, registry)
	go bots.RunAlphaBot(ctx, inChan, abCandleCh, registry)

	// 5. HTTP server
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
