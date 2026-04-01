package bots

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/nextbull/trading-terminal/internal/engine"
)

const (
	abFastPeriod  = 9
	abSlowPeriod  = 21
	abRSIPeriod   = 14
	abBufferSize  = 50
	abTradeSize   = 50.0
	abMaxPosition = 200.0
	abRSIBuyGate  = 45.0
	abRSISellGate = 55.0
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

			bullishCross := prevFast != 0 && prevFast < prevSlow && fast > slow
			bearishCross := prevFast != 0 && prevFast > prevSlow && fast < slow

			if bullishCross && rsi < abRSIBuyGate && position < abMaxPosition && portfolio.Cash() >= candle.Close*abTradeSize {
				order := &engine.Order{
					ID:        fmt.Sprintf("ab_%s", uuid.NewString()[:8]),
					Type:      engine.TypeMarket,
					Side:      engine.Buy,
					Size:      abTradeSize,
					Remaining: abTradeSize,
					UserID:    abUserID,
					CreatedAt: time.Now(),
				}
				select {
				case inChan <- order:
				default:
				}
			} else if bearishCross && rsi > abRSISellGate && position > -abMaxPosition {
				order := &engine.Order{
					ID:        fmt.Sprintf("ab_%s", uuid.NewString()[:8]),
					Type:      engine.TypeMarket,
					Side:      engine.Sell,
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
