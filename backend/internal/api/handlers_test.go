package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Om-Jadon/synthetic-bull-trading-terminal/backend/internal/engine"
)

const testSessionID = "12345678-1234-1234-1234-123456789abc"

func newTestHandlers(cash float64) (*Handlers, chan *engine.Order) {
	inChan := make(chan *engine.Order, 10)
	r := engine.NewRegistry()
	p := r.GetOrCreate(testSessionID)
	// Seed the portfolio with the desired cash amount by applying a synthetic trade
	// that adjusts cash. Simpler: use NewRegistry and set cash via a private-package trick.
	// Since we can't set cash directly, use the registry with the default $100k and
	// override via a sell trade for tests needing low cash.
	_ = p
	// For the cash-limit tests we need a portfolio with specific cash.
	// Wrap a minimal stub registry instead.
	reg := &stubRegistry{cash: cash}
	h := New(inChan, reg, func() float64 { return 100.0 })
	return h, inChan
}

// stubRegistry is a test-only registry that always returns a portfolio with preset cash.
type stubRegistry struct {
	cash float64
	p    *engine.Portfolio
}

func (s *stubRegistry) GetOrCreate(userID string) *engine.Portfolio {
	if s.p == nil {
		s.p = engine.NewPortfolio(userID, s.cash)
	}
	return s.p
}

type spyRegistry struct {
	calls int
	last  string
	p     *engine.Portfolio
}

func (s *spyRegistry) GetOrCreate(userID string) *engine.Portfolio {
	s.calls++
	s.last = userID
	if s.p == nil {
		s.p = engine.NewPortfolio(userID, 100_000)
	}
	return s.p
}

func postOrder(t *testing.T, h *Handlers, body map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/orders", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Session-ID", testSessionID)
	w := httptest.NewRecorder()
	h.PostOrder(w, req)
	return w
}

func deleteOrder(t *testing.T, h *Handlers, orderID string, sessionID string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("DELETE", "/orders/"+orderID, nil)
	req.SetPathValue("id", orderID)
	if sessionID != "" {
		req.Header.Set("X-Session-ID", sessionID)
	}
	w := httptest.NewRecorder()
	h.DeleteOrder(w, req)
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

func TestPostOrder_MarketBuy_CreatesSessionPortfolio(t *testing.T) {
	inChan := make(chan *engine.Order, 1)
	spy := &spyRegistry{}
	h := New(inChan, spy, func() float64 { return 100.0 })

	w := postOrder(t, h, map[string]any{
		"type": "market", "side": "buy", "size": 1.0,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if spy.calls == 0 {
		t.Fatal("expected GetOrCreate to be called for market order")
	}
	if spy.last != testSessionID {
		t.Fatalf("expected GetOrCreate called with session id, got %q", spy.last)
	}
}

func TestDeleteOrder_MissingSessionHeader_Returns400(t *testing.T) {
	h, _ := newTestHandlers(100_000)
	w := deleteOrder(t, h, "o_1", "")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing session header, got %d", w.Code)
	}
}

func TestDeleteOrder_InvalidSessionHeader_Returns400(t *testing.T) {
	h, _ := newTestHandlers(100_000)
	w := deleteOrder(t, h, "o_1", "not-a-uuid")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid session header, got %d", w.Code)
	}
}

func TestDeleteOrder_EnqueuesCancelWithSessionID(t *testing.T) {
	h, inChan := newTestHandlers(100_000)
	w := deleteOrder(t, h, "o_1", testSessionID)
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
	select {
	case o := <-inChan:
		if o.Type != engine.TypeCancel {
			t.Fatalf("expected cancel order, got %s", o.Type)
		}
		if o.UserID != testSessionID {
			t.Fatalf("expected cancel order user id %q, got %q", testSessionID, o.UserID)
		}
	default:
		t.Fatal("expected cancel order to be enqueued")
	}
}
