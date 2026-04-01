package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nextbull/trading-terminal/internal/engine"
)

func newTestHandlers(cash float64) (*Handlers, chan *engine.Order) {
	inChan := make(chan *engine.Order, 10)
	p := engine.NewPortfolio("human", cash)
	h := New(inChan, p, func() float64 { return 100.0 })
	return h, inChan
}

func postOrder(t *testing.T, h *Handlers, body map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/orders", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.PostOrder(w, req)
	return w
}

func TestPostOrder_LimitBuy_ExceedsCash_Returns400(t *testing.T) {
	h, _ := newTestHandlers(500.0) // only $500
	w := postOrder(t, h, map[string]any{
		"type": "limit", "side": "buy", "price": 100.0, "size": 10.0, // costs $1000
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for buy exceeding cash, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPostOrder_LimitBuy_WithinCash_Accepted(t *testing.T) {
	h, _ := newTestHandlers(10_000.0)
	w := postOrder(t, h, map[string]any{
		"type": "limit", "side": "buy", "price": 100.0, "size": 10.0, // costs $1000
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPostOrder_SellWithoutHoldings_Allowed(t *testing.T) {
	// Short selling is explicitly permitted by PS — must not be blocked
	h, _ := newTestHandlers(100_000.0) // 0 holdings
	w := postOrder(t, h, map[string]any{
		"type": "limit", "side": "sell", "price": 100.0, "size": 10.0,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for short sell (PS permitted), got %d: %s", w.Code, w.Body.String())
	}
}

func TestPostOrder_MarketBuy_NoValidation_Accepted(t *testing.T) {
	// Market buy orders have no price — skip cash validation
	h, _ := newTestHandlers(1.0) // almost no cash
	w := postOrder(t, h, map[string]any{
		"type": "market", "side": "buy", "size": 100.0,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for market buy (no price to validate), got %d", w.Code)
	}
}
