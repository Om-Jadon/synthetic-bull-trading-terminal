package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/nextbull/trading-terminal/internal/engine"
)

// OrderRequest is the POST /orders JSON body.
type OrderRequest struct {
	Type  string  `json:"type"`  // "limit" or "market"
	Side  string  `json:"side"`  // "buy" or "sell"
	Price float64 `json:"price"` // omit for market orders
	Size  float64 `json:"size"`
}

// OrderResponse is the POST /orders JSON response.
type OrderResponse struct {
	OrderID string `json:"order_id"`
	Status  string `json:"status"`
}

// Handlers holds dependencies for HTTP handlers.
type Handlers struct {
	inChan chan<- *engine.Order
}

func New(inChan chan<- *engine.Order) *Handlers {
	return &Handlers{inChan: inChan}
}

func (h *Handlers) PostOrder(w http.ResponseWriter, r *http.Request) {
	var req OrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if req.Size <= 0 {
		http.Error(w, "size must be positive", http.StatusBadRequest)
		return
	}

	var typ engine.OrderType
	switch req.Type {
	case "limit":
		typ = engine.TypeLimit
		if req.Price <= 0 {
			http.Error(w, "price required for limit orders", http.StatusBadRequest)
			return
		}
	case "market":
		typ = engine.TypeMarket
	default:
		http.Error(w, "type must be limit or market", http.StatusBadRequest)
		return
	}

	var side engine.Side
	switch req.Side {
	case "buy":
		side = engine.Buy
	case "sell":
		side = engine.Sell
	default:
		http.Error(w, "side must be buy or sell", http.StatusBadRequest)
		return
	}

	orderID := "o_" + uuid.NewString()
	o := &engine.Order{
		ID:        orderID,
		Type:      typ,
		Side:      side,
		Price:     req.Price,
		Size:      req.Size,
		Remaining: req.Size,
		UserID:    "human",
		CreatedAt: time.Now(),
	}

	select {
	case h.inChan <- o:
	default:
		http.Error(w, "engine overloaded, try again", http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(OrderResponse{OrderID: orderID, Status: "accepted"})
}

func (h *Handlers) DeleteOrder(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "missing order id", http.StatusBadRequest)
		return
	}
	cancel := &engine.Order{
		ID:   id,
		Type: engine.TypeCancel,
	}
	select {
	case h.inChan <- cancel:
	default:
		http.Error(w, "engine overloaded", http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetCandles returns historical OHLCV candles.
func GetCandles(candlesFn func(n int) any) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		n := 300
		if lim := r.URL.Query().Get("limit"); lim != "" {
			if v, err := strconv.Atoi(lim); err == nil && v > 0 && v <= 1000 {
				n = v
			}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"candles": candlesFn(n),
		})
	}
}

// HealthHandler returns 200 OK when ready.
func HealthHandler(ready func() bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if ready != nil && !ready() {
			http.Error(w, "not ready", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"ok"}`)
	}
}

// CORS middleware — allows browser connections from any origin (competition demo).
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
