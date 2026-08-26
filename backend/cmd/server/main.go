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

	"github.com/google/uuid"
	"github.com/Om-Jadon/synthetic-bull-trading-terminal/backend/internal/api"
	"github.com/Om-Jadon/synthetic-bull-trading-terminal/backend/internal/bots"
	"github.com/Om-Jadon/synthetic-bull-trading-terminal/backend/internal/engine"
	"github.com/Om-Jadon/synthetic-bull-trading-terminal/backend/internal/generator"
	"github.com/Om-Jadon/synthetic-bull-trading-terminal/backend/internal/hub"
)

func main() {
	cfg := generator.Config{
		S0:               envFloat("GBM_S0", 100.0),
		Mu:               envFloat("GBM_MU", 0.0),
		Sigma:            envFloat("GBM_SIGMA", 0.015),
		TickMs:           envInt("GBM_TICK_MS", 10),
		TargetMsgsPerSec: envInt("GBM_TARGET_MSGS_PER_SEC", 200),
		CancelShare:      envFloat("GBM_CANCEL_SHARE", 0.20),
		MarketOrderShare: envFloat("GBM_MARKET_ORDER_SHARE", 0.05),
		MaxResting:       envInt("GBM_MAX_RESTING", 150),
	}
	port := envStr("PORT", envStr("BACKEND_PORT", "8080"))

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	inChan := make(chan *engine.Order, 1024)
	mmPriceCh := make(chan float64, 1)
	abCandleCh := make(chan engine.Candle, 10)

	matcher := engine.NewMatcher()
	candleStore := engine.NewCandleStore(cfg.S0)
	// Only bot portfolios are pre-seeded; session portfolios are created on first connect.
	registry := engine.NewRegistry("market_maker", "alpha_bot")
	wsHub := hub.New()

	var ready atomic.Bool

	handlers := api.New(inChan, registry, func() float64 { return candleStore.Stats().LastPrice })

	// makeSnapshotFn returns a per-session snapshot function called once on WS connect.
	makeSnapshotFn := func(sessionID string) func() []byte {
		return func() []byte {
			bids, asks := matcher.Depth(150)
			currentStats := candleStore.Stats()
			sessionPortfolio := registry.GetOrCreate(sessionID)
			botPortfolios := make([]map[string]any, 0, 2)
			botEquityHistory := make(map[string]any, 2)
			for _, botID := range []string{"market_maker", "alpha_bot"} {
				if p := registry.Get(botID); p != nil {
					botPortfolios = append(botPortfolios, p.State(currentStats.LastPrice))
					botEquityHistory[botID] = p.EquityHistory()
				}
			}
			snap := map[string]any{
				"type": "snapshot",
				"book": map[string]any{
					"bids": bids,
					"asks": asks,
					"ts":   time.Now().UnixMilli(),
				},
				"candles":          candleStore.Snapshot(7200),
				"portfolio":        sessionPortfolio.State(currentStats.LastPrice),
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
				"recent_trades":      candleStore.RecentTrades(),
				"equity_history":     sessionPortfolio.EquityHistory(),
				"bot_portfolios":     botPortfolios,
				"bot_equity_history": botEquityHistory,
				"fills":              sessionPortfolio.FillLog(),
				"activity_log":       sessionPortfolio.ActivityLog(),
				"open_orders":        matcher.OpenSessionOrders(sessionID),
				"ts":                 time.Now().UnixMilli(),
			}
			b, _ := json.Marshal(snap)
			return b
		}
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
		sessionID := r.URL.Query().Get("session")
		if sessionID == "" {
			http.Error(w, "missing session query param", http.StatusBadRequest)
			return
		}
		if _, err := uuid.Parse(sessionID); err != nil {
			http.Error(w, "invalid session ID", http.StatusBadRequest)
			return
		}
		registry.GetOrCreate(sessionID) // ensure portfolio exists before snapshot
		wsHub.ServeWS(w, r, sessionID, makeSnapshotFn(sessionID))
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
					// order_update and portfolio changes are targeted to the owning session
					wsHub.Send(u.UserID, msg)
					if p := registry.Get(u.UserID); p != nil {
						p.RecordActivity(engine.ActivityRecord{
							OrderID:       u.OrderID,
							Status:        u.Status,
							FilledSize:    u.FilledSize,
							RemainingSize: u.RemainingSize,
							Price:         u.Price,
							Side:          u.Side,
							Ts:            u.Ts,
						})
						if u.Status == engine.StatusPartial || u.Status == engine.StatusFilled {
							lastPrice := candleStore.Stats().LastPrice
							p.RecordEquity(lastPrice)
							pmsg, _ := json.Marshal(p.State(lastPrice))
							wsHub.Send(u.UserID, pmsg)
						}
					}
				}

			case <-bookTicker.C:
				if purged := matcher.PurgeStaleSessionOrders(30 * time.Minute); purged > 0 {
					log.Printf("purged %d stale session orders (no fill/cancel in 30min)", purged)
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
				// Record equity for all portfolios; broadcast only bot portfolio states.
				// Session portfolio states are pushed on fills only (more meaningful).
				for userID, p := range registry.All() {
					p.RecordEquity(stats.LastPrice)
					if userID == "market_maker" || userID == "alpha_bot" {
						pmsg, _ := json.Marshal(p.State(stats.LastPrice))
						wsHub.Broadcast(pmsg)
					}
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
