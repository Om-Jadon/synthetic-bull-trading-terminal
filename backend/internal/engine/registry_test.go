package engine

import "testing"

func TestRegistry_GetKnownUser(t *testing.T) {
	r := NewRegistry("human", "market_maker")
	if r.Get("human") == nil {
		t.Fatal("expected non-nil portfolio for 'human'")
	}
	if r.Get("market_maker") == nil {
		t.Fatal("expected non-nil portfolio for 'market_maker'")
	}
}

func TestRegistry_GetUnknownUser_ReturnsNil(t *testing.T) {
	r := NewRegistry("human")
	if r.Get("system") != nil {
		t.Fatal("expected nil for unknown user 'system'")
	}
}

func TestRegistry_All_ReturnsAllPortfolios(t *testing.T) {
	r := NewRegistry("human", "market_maker", "alpha_bot")
	all := r.All()
	if len(all) != 3 {
		t.Fatalf("expected 3 portfolios, got %d", len(all))
	}
}
