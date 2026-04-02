package bots

// EMA computes the Exponential Moving Average of prices using the given period.
// Seeds with the SMA of the first `period` values, then applies EMA smoothing.
// Returns 0 if len(prices) < period.
func EMA(prices []float64, period int) float64 {
	if len(prices) < period {
		return 0
	}
	k := 2.0 / float64(period+1)
	// Seed with first price, apply EMA from index 1
	ema := prices[0]
	for i := 1; i < len(prices); i++ {
		ema = prices[i]*k + ema*(1-k)
	}
	return ema
}

// RSI computes the RSI of prices using the given period.
// Uses SMA for the initial average gain/loss, then Wilder's smoothing.
// Returns 0 if len(prices) < period+1 (need at least period+1 values for period changes).
func RSI(prices []float64, period int) float64 {
	if len(prices) < period+1 {
		return 0
	}
	// Compute changes
	changes := make([]float64, len(prices)-1)
	for i := 1; i < len(prices); i++ {
		changes[i-1] = prices[i] - prices[i-1]
	}
	// Seed with SMA of first period gains/losses
	var gainSum, lossSum float64
	for i := 0; i < period; i++ {
		if changes[i] > 0 {
			gainSum += changes[i]
		} else {
			lossSum += -changes[i]
		}
	}
	avgGain := gainSum / float64(period)
	avgLoss := lossSum / float64(period)
	// Wilder's smoothing for remaining changes
	for i := period; i < len(changes); i++ {
		gain, loss := 0.0, 0.0
		if changes[i] > 0 {
			gain = changes[i]
		} else {
			loss = -changes[i]
		}
		avgGain = (avgGain*float64(period-1) + gain) / float64(period)
		avgLoss = (avgLoss*float64(period-1) + loss) / float64(period)
	}
	if avgLoss == 0 {
		return 100
	}
	rs := avgGain / avgLoss
	return 100 - (100 / (1 + rs))
}
