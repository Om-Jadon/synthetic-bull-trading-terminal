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

// GetOrCreate returns the Portfolio for userID, creating one with startingCapital if it does not exist.
// Safe to call concurrently from any goroutine.
func (r *PortfolioRegistry) GetOrCreate(userID string) *Portfolio {
	r.mu.RLock()
	p := r.portfolios[userID]
	r.mu.RUnlock()
	if p != nil {
		return p
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if p = r.portfolios[userID]; p != nil {
		return p
	}
	p = NewPortfolio(userID, startingCapital)
	r.portfolios[userID] = p
	return p
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
