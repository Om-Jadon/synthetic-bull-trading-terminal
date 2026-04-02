package bots

import (
	"math"
	"testing"
)

func TestEMA_SingleValue(t *testing.T) {
	prices := []float64{100.0}
	got := EMA(prices, 1)
	if got != 100.0 {
		t.Fatalf("expected 100.0, got %f", got)
	}
}

func TestEMA_KnownSequence(t *testing.T) {
	// k = 2/(3+1) = 0.5
	// EMA[0] = 10 (seed with SMA of first period)
	// EMA[1] = 20 * 0.5 + 10 * 0.5 = 15
	// EMA[2] = 30 * 0.5 + 15 * 0.5 = 22.5
	// EMA[3] = 40 * 0.5 + 22.5 * 0.5 = 31.25
	// EMA[4] = 50 * 0.5 + 31.25 * 0.5 = 40.625
	prices := []float64{10, 20, 30, 40, 50}
	got := EMA(prices, 3)
	want := 40.625
	if math.Abs(got-want) > 0.001 {
		t.Fatalf("expected %f, got %f", want, got)
	}
}

func TestEMA_InsufficientData_ReturnsZero(t *testing.T) {
	got := EMA([]float64{1, 2}, 5)
	if got != 0 {
		t.Fatalf("expected 0 for insufficient data, got %f", got)
	}
}

func TestRSI_AllGains_Returns100(t *testing.T) {
	prices := make([]float64, 30)
	for i := range prices {
		prices[i] = float64(100 + i)
	}
	got := RSI(prices, 14)
	if got < 90 {
		t.Fatalf("expected RSI near 100 for all-gains series, got %f", got)
	}
}

func TestRSI_AllLosses_Returns0(t *testing.T) {
	prices := make([]float64, 30)
	for i := range prices {
		prices[i] = float64(100 - i)
	}
	got := RSI(prices, 14)
	if got > 10 {
		t.Fatalf("expected RSI near 0 for all-losses series, got %f", got)
	}
}

func TestRSI_InsufficientData_ReturnsZero(t *testing.T) {
	got := RSI([]float64{1, 2, 3}, 14)
	if got != 0 {
		t.Fatalf("expected 0 for insufficient data, got %f", got)
	}
}
