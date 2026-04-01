package bots

import (
	"testing"

	"github.com/nextbull/trading-terminal/internal/engine"
)

func TestAlphaSignal_BullishCrossWithMomentumRSI_TriggersBuy(t *testing.T) {
	side, ok := alphaSignal(
		99.0, // prevFast
		100.0, // prevSlow
		101.0, // fast
		100.5, // slow
		60.0, // rsi
		0.0, // position
		100000.0, // cash
		100.0, // close
	)

	if !ok {
		t.Fatalf("expected bullish signal to trigger")
	}
	if side != engine.Buy {
		t.Fatalf("expected buy side, got %v", side)
	}
}

func TestAlphaSignal_BearishCrossWithMomentumRSI_TriggersSell(t *testing.T) {
	side, ok := alphaSignal(
		101.0,
		100.0,
		99.0,
		100.5,
		40.0,
		0.0,
		100000.0,
		100.0,
	)

	if !ok {
		t.Fatalf("expected bearish signal to trigger")
	}
	if side != engine.Sell {
		t.Fatalf("expected sell side, got %v", side)
	}
}

func TestAlphaSignal_BuyBlockedByCash(t *testing.T) {
	_, ok := alphaSignal(
		99.0,
		100.0,
		101.0,
		100.5,
		60.0,
		0.0,
		1000.0, // insufficient for 50 * 100
		100.0,
	)

	if ok {
		t.Fatalf("expected signal to be blocked by cash guard")
	}
}

func TestAlphaSignal_NoCross_NoTrade(t *testing.T) {
	_, ok := alphaSignal(
		100.0,
		100.0,
		100.1,
		100.0,
		30.0,
		0.0,
		100000.0,
		100.0,
	)

	if ok {
		t.Fatalf("expected no trade without crossover")
	}
}

func TestAlphaSignal_BullishCrossWithoutMomentum_NoTrade(t *testing.T) {
	_, ok := alphaSignal(
		99.0,
		100.0,
		101.0,
		100.5,
		45.0,
		0.0,
		100000.0,
		100.0,
	)

	if ok {
		t.Fatalf("expected bullish cross without momentum confirmation to be blocked")
	}
}

func TestAlphaSignal_BearishCrossWithoutMomentum_NoTrade(t *testing.T) {
	_, ok := alphaSignal(
		101.0,
		100.0,
		99.0,
		100.5,
		55.0,
		0.0,
		100000.0,
		100.0,
	)

	if ok {
		t.Fatalf("expected bearish cross without momentum confirmation to be blocked")
	}
}

func TestAlphaSignal_BullTrendWithoutNewCross_TriggersBuy(t *testing.T) {
	side, ok := alphaSignal(
		101.0,
		100.0,
		102.0,
		101.0,
		58.0,
		0.0,
		100000.0,
		100.0,
	)

	if !ok {
		t.Fatalf("expected bullish trend confirmation to trigger")
	}
	if side != engine.Buy {
		t.Fatalf("expected buy side, got %v", side)
	}
}

func TestAlphaSignal_BearTrendWithoutNewCross_TriggersSell(t *testing.T) {
	side, ok := alphaSignal(
		99.0,
		100.0,
		98.0,
		99.0,
		42.0,
		0.0,
		100000.0,
		100.0,
	)

	if !ok {
		t.Fatalf("expected bearish trend confirmation to trigger")
	}
	if side != engine.Sell {
		t.Fatalf("expected sell side, got %v", side)
	}
}
