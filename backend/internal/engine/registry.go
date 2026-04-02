package engine

import "sync"

const startingCapital = 100_000.0

// PortfolioRegistry holds one Portfolio per named user.
// Get and All are safe to call from any goroutine.
type PortfolioRegistry struct {
	mu         sync.RWMutex
	portfolios map[string]*Portfolio
}

// NewRegistry creates a registry with one Portfolio per userID,
// each starting with startingCapital.
func NewRegistry(userIDs ...string) *PortfolioRegistry {
	r := &PortfolioRegistry{portfolios: make(map[string]*Portfolio, len(userIDs))}
	for _, id := range userIDs {
		r.portfolios[id] = NewPortfolio(id, startingCapital)
	}
	return r
}

// Get returns the Portfolio for userID, or nil if userID is unknown.
// Safe to call from any goroutine.
func (r *PortfolioRegistry) Get(userID string) *Portfolio {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.portfolios[userID]
}

// All returns a snapshot copy of the portfolios map.
// Safe to call from any goroutine.
func (r *PortfolioRegistry) All() map[string]*Portfolio {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make(map[string]*Portfolio, len(r.portfolios))
	for k, v := range r.portfolios {
		out[k] = v
	}
	return out
}
