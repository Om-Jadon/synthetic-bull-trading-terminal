package bots

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/nextbull/trading-terminal/internal/engine"
)

const (
	mmBaseSpread    = 0.15
	mmLambda        = 0.0002
	mmMaxInventory  = 500.0
	mmQuoteSize     = 10.0
	mmQuoteInterval = 500 * time.Millisecond
	mmUserID        = "market_maker"
)

// RunMarketMaker runs the market maker bot until ctx is cancelled.
// It reads mid-price from priceCh and places symmetric quotes around mid,
// skewing them based on current inventory.
func RunMarketMaker(
	ctx context.Context,
	inChan chan<- *engine.Order,
	priceCh <-chan float64,
	registry *engine.PortfolioRegistry,
) {
	ticker := time.NewTicker(mmQuoteInterval)
	defer ticker.Stop()

	var lastPrice float64
	var activeOrderIDs []string

	for {
		select {
		case <-ctx.Done():
			return

		case price := <-priceCh:
			lastPrice = price

		case <-ticker.C:
			if lastPrice == 0 {
				continue
			}

			// Cancel previous quotes
			for _, id := range activeOrderIDs {
				cancel := &engine.Order{
					ID:   id,
					Type: engine.TypeCancel,
				}
				select {
				case inChan <- cancel:
				default:
				}
			}
			activeOrderIDs = activeOrderIDs[:0]

			portfolio := registry.Get(mmUserID)
			if portfolio == nil {
				continue
			}
			inventory := portfolio.Holdings()
			cash := portfolio.Cash()

			skew := mmLambda * inventory
			mid := lastPrice

			bidPrice := roundMM(mid - mmBaseSpread - skew)
			askPrice := roundMM(mid + mmBaseSpread + skew)

			// Only quote bid if inventory is below cap and we have sufficient cash
			if inventory < mmMaxInventory && cash >= bidPrice*mmQuoteSize {
				bidID := fmt.Sprintf("mm_bid_%s", uuid.NewString()[:8])
				bid := &engine.Order{
					ID:        bidID,
					Type:      engine.TypeLimit,
					Side:      engine.Buy,
					Price:     bidPrice,
					Size:      mmQuoteSize,
					Remaining: mmQuoteSize,
					UserID:    mmUserID,
					CreatedAt: time.Now(),
				}
				select {
				case inChan <- bid:
					activeOrderIDs = append(activeOrderIDs, bidID)
				default:
				}
			}

			// Only quote ask if inventory is above negative cap
			if inventory > -mmMaxInventory {
				askID := fmt.Sprintf("mm_ask_%s", uuid.NewString()[:8])
				ask := &engine.Order{
					ID:        askID,
					Type:      engine.TypeLimit,
					Side:      engine.Sell,
					Price:     askPrice,
					Size:      mmQuoteSize,
					Remaining: mmQuoteSize,
					UserID:    mmUserID,
					CreatedAt: time.Now(),
				}
				select {
				case inChan <- ask:
					activeOrderIDs = append(activeOrderIDs, askID)
				default:
				}
			}
		}
	}
}

func roundMM(f float64) float64 {
	return math.Round(f*100) / 100
}
