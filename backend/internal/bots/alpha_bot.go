package bots

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/Om-Jadon/synthetic-bull-trading-terminal/backend/internal/engine"
)

const (
	abFastPeriod  = 9
	abSlowPeriod  = 21
	abRSIPeriod   = 14
	abBufferSize  = 35
	abTradeSize   = 50.0
	abMaxPosition = 200.0
	abRSIBuyGate  = 52.0
	abRSISellGate = 48.0
	abUserID      = "alpha_bot"
)

// RunAlphaBot runs the alpha bot until ctx is cancelled.
// It listens for completed candles on candleCh and fires market orders
// on MA crossover signals gated by RSI.
func RunAlphaBot(
	ctx context.Context,
	inChan chan<- *engine.Order,
	candleCh <-chan engine.Candle,
	registry *engine.PortfolioRegistry,
) {
	closes := make([]float64, 0, abBufferSize+1)
	var prevFast, prevSlow float64

	for {
		select {
		case <-ctx.Done():
			return

		case candle := <-candleCh:
			closes = append(closes, candle.Close)
			if len(closes) > abBufferSize {
				closes = closes[len(closes)-abBufferSize:]
			}
			if len(closes) < abBufferSize {
				continue
			}

			fast := EMA(closes, abFastPeriod)
			slow := EMA(closes, abSlowPeriod)
			rsi := RSI(closes, abRSIPeriod)

			portfolio := registry.Get(abUserID)
			if portfolio == nil {
				prevFast, prevSlow = fast, slow
				continue
			}
			position := portfolio.Holdings()

			side, shouldTrade := alphaSignal(prevFast, prevSlow, fast, slow, rsi, position, portfolio.Cash(), candle.Close)

			if shouldTrade {
				order := &engine.Order{
					ID:        fmt.Sprintf("ab_%s", uuid.NewString()[:8]),
					Type:      engine.TypeMarket,
					Side:      side,
					Size:      abTradeSize,
					Remaining: abTradeSize,
					UserID:    abUserID,
					CreatedAt: time.Now(),
				}
				select {
				case inChan <- order:
				default:
				}
			}

			prevFast, prevSlow = fast, slow
		}
	}
}

func alphaSignal(
	prevFast float64,
	prevSlow float64,
	fast float64,
	slow float64,
	rsi float64,
	position float64,
	cash float64,
	close float64,
) (engine.Side, bool) {
	bullishTrend := fast > slow
	bearishTrend := fast < slow

	if bullishTrend && rsi >= abRSIBuyGate && position+abTradeSize <= abMaxPosition && cash >= close*abTradeSize {
		return engine.Buy, true
	}
	if bearishTrend && rsi <= abRSISellGate && position-abTradeSize >= -abMaxPosition {
		return engine.Sell, true
	}
	return "", false
}
