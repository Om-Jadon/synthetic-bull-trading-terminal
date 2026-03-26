package engine

import "testing"

func makeTrade(price, size float64, humanIsBuyer bool) *Trade {
	return &Trade{
		Price:         price,
		Size:          size,
		HumanInvolved: true,
		HumanIsBuyer:  humanIsBuyer,
	}
}

func TestPortfolio_Buy_UpdatesCashAndHoldings(t *testing.T) {
	p := NewPortfolio(100_000)
	p.OnTrade(makeTrade(100.0, 10.0, true))
	s := p.State(100.0)
	if s["cash"].(float64) != 99_000.0 {
		t.Fatalf("expected cash 99000, got %v", s["cash"])
	}
	if s["holdings"].(float64) != 10.0 {
		t.Fatalf("expected holdings 10, got %v", s["holdings"])
	}
	if s["avg_entry"].(float64) != 100.0 {
		t.Fatalf("expected avg_entry 100, got %v", s["avg_entry"])
	}
}

func TestPortfolio_LongSell_RealizesProfit(t *testing.T) {
	p := NewPortfolio(100_000)
	p.OnTrade(makeTrade(100.0, 10.0, true))  // buy 10 @ 100
	p.OnTrade(makeTrade(110.0, 10.0, false)) // sell 10 @ 110
	s := p.State(110.0)
	if s["realized_pnl"].(float64) != 100.0 {
		t.Fatalf("expected realized_pnl 100, got %v", s["realized_pnl"])
	}
	if s["holdings"].(float64) != 0.0 {
		t.Fatalf("expected holdings 0, got %v", s["holdings"])
	}
}

func TestPortfolio_LongSell_RealizesLoss(t *testing.T) {
	p := NewPortfolio(100_000)
	p.OnTrade(makeTrade(100.0, 10.0, true)) // buy 10 @ 100
	p.OnTrade(makeTrade(90.0, 10.0, false)) // sell 10 @ 90
	s := p.State(90.0)
	if s["realized_pnl"].(float64) != -100.0 {
		t.Fatalf("expected realized_pnl -100, got %v", s["realized_pnl"])
	}
}

func TestPortfolio_ShortSell_NegativeHoldings(t *testing.T) {
	p := NewPortfolio(100_000)
	p.OnTrade(makeTrade(100.0, 10.0, false)) // short 10 @ 100
	s := p.State(100.0)
	if s["holdings"].(float64) != -10.0 {
		t.Fatalf("expected holdings -10, got %v", s["holdings"])
	}
	if s["avg_entry"].(float64) != 100.0 {
		t.Fatalf("expected avg_entry 100, got %v", s["avg_entry"])
	}
	// cash increases on short sale
	if s["cash"].(float64) != 101_000.0 {
		t.Fatalf("expected cash 101000, got %v", s["cash"])
	}
}

func TestPortfolio_ShortCover_RealizesProfit(t *testing.T) {
	p := NewPortfolio(100_000)
	p.OnTrade(makeTrade(100.0, 10.0, false)) // short 10 @ 100
	p.OnTrade(makeTrade(90.0, 10.0, true))   // cover 10 @ 90
	s := p.State(90.0)
	if s["realized_pnl"].(float64) != 100.0 {
		t.Fatalf("expected realized_pnl 100, got %v", s["realized_pnl"])
	}
	if s["holdings"].(float64) != 0.0 {
		t.Fatalf("expected holdings 0 after full cover, got %v", s["holdings"])
	}
}

func TestPortfolio_ShortCover_RealizesLoss(t *testing.T) {
	p := NewPortfolio(100_000)
	p.OnTrade(makeTrade(100.0, 10.0, false)) // short 10 @ 100
	p.OnTrade(makeTrade(110.0, 10.0, true))  // cover 10 @ 110 (loss)
	s := p.State(110.0)
	if s["realized_pnl"].(float64) != -100.0 {
		t.Fatalf("expected realized_pnl -100, got %v", s["realized_pnl"])
	}
}

func TestPortfolio_LongToShortFlip_CorrectPnL(t *testing.T) {
	p := NewPortfolio(100_000)
	p.OnTrade(makeTrade(100.0, 10.0, true))  // buy 10 @ 100
	p.OnTrade(makeTrade(105.0, 20.0, false)) // sell 20 @ 105 (close 10 long + open 10 short)
	s := p.State(105.0)
	// realized: (105-100)*10 = +50
	if s["realized_pnl"].(float64) != 50.0 {
		t.Fatalf("expected realized_pnl 50, got %v", s["realized_pnl"])
	}
	// now short 10 @ 105
	if s["holdings"].(float64) != -10.0 {
		t.Fatalf("expected holdings -10, got %v", s["holdings"])
	}
	if s["avg_entry"].(float64) != 105.0 {
		t.Fatalf("expected avg_entry 105 (short side), got %v", s["avg_entry"])
	}
}

func TestPortfolio_ShortToLongFlip_CorrectPnL(t *testing.T) {
	p := NewPortfolio(100_000)
	p.OnTrade(makeTrade(100.0, 10.0, false)) // short 10 @ 100
	p.OnTrade(makeTrade(90.0, 20.0, true))   // buy 20 @ 90 (cover 10 short + open 10 long)
	s := p.State(90.0)
	// realized: (100-90)*10 = +100
	if s["realized_pnl"].(float64) != 100.0 {
		t.Fatalf("expected realized_pnl 100, got %v", s["realized_pnl"])
	}
	// now long 10 @ 90
	if s["holdings"].(float64) != 10.0 {
		t.Fatalf("expected holdings 10, got %v", s["holdings"])
	}
	if s["avg_entry"].(float64) != 90.0 {
		t.Fatalf("expected avg_entry 90 (new long), got %v", s["avg_entry"])
	}
}

func TestPortfolio_AvgEntry_MultipleBuilds(t *testing.T) {
	p := NewPortfolio(100_000)
	p.OnTrade(makeTrade(100.0, 10.0, true)) // buy 10 @ 100
	p.OnTrade(makeTrade(110.0, 10.0, true)) // buy 10 @ 110
	s := p.State(100.0)
	// avg = (100*10 + 110*10) / 20 = 105
	if s["avg_entry"].(float64) != 105.0 {
		t.Fatalf("expected avg_entry 105, got %v", s["avg_entry"])
	}
	if s["holdings"].(float64) != 20.0 {
		t.Fatalf("expected holdings 20, got %v", s["holdings"])
	}
}

func TestPortfolio_AvgEntry_AddsToShort(t *testing.T) {
	p := NewPortfolio(100_000)
	p.OnTrade(makeTrade(100.0, 5.0, false)) // short 5 @ 100
	p.OnTrade(makeTrade(110.0, 5.0, false)) // short 5 more @ 110
	s := p.State(100.0)
	// avg short = (100*5 + 110*5) / 10 = 105
	if s["avg_entry"].(float64) != 105.0 {
		t.Fatalf("expected avg_entry 105, got %v", s["avg_entry"])
	}
	if s["holdings"].(float64) != -10.0 {
		t.Fatalf("expected holdings -10, got %v", s["holdings"])
	}
}

func TestPortfolio_UnrealizedPnL_Long(t *testing.T) {
	p := NewPortfolio(100_000)
	p.OnTrade(makeTrade(100.0, 10.0, true)) // buy 10 @ 100
	s := p.State(110.0)
	// unrealized = (110 - 100) * 10 = +100
	if s["unrealized_pnl"].(float64) != 100.0 {
		t.Fatalf("expected unrealized_pnl 100, got %v", s["unrealized_pnl"])
	}
}

func TestPortfolio_UnrealizedPnL_Short(t *testing.T) {
	p := NewPortfolio(100_000)
	p.OnTrade(makeTrade(100.0, 10.0, false)) // short 10 @ 100
	s := p.State(90.0)
	// unrealized = (100 - 90) * 10 = +100
	if s["unrealized_pnl"].(float64) != 100.0 {
		t.Fatalf("expected unrealized_pnl 100 for profitable short, got %v", s["unrealized_pnl"])
	}
}

func TestPortfolio_UnrealizedPnL_ShortLoss(t *testing.T) {
	p := NewPortfolio(100_000)
	p.OnTrade(makeTrade(100.0, 10.0, false)) // short 10 @ 100
	s := p.State(110.0)
	// unrealized = (100 - 110) * 10 = -100
	if s["unrealized_pnl"].(float64) != -100.0 {
		t.Fatalf("expected unrealized_pnl -100 for losing short, got %v", s["unrealized_pnl"])
	}
}

func TestPortfolio_Equity_Long(t *testing.T) {
	p := NewPortfolio(100_000)
	p.OnTrade(makeTrade(100.0, 10.0, true)) // buy 10 @ 100, cash = 99000
	s := p.State(110.0)
	// equity = cash + holdings * price = 99000 + 10*110 = 100100
	if s["equity"].(float64) != 100_100.0 {
		t.Fatalf("expected equity 100100, got %v", s["equity"])
	}
}

func TestPortfolio_Equity_Short(t *testing.T) {
	p := NewPortfolio(100_000)
	p.OnTrade(makeTrade(100.0, 10.0, false)) // short 10 @ 100, cash = 101000
	s := p.State(90.0)
	// equity = cash + holdings * price = 101000 + (-10)*90 = 101000 - 900 = 100100
	if s["equity"].(float64) != 100_100.0 {
		t.Fatalf("expected equity 100100 for profitable short, got %v", s["equity"])
	}
}

func TestPortfolio_NonHumanTrade_Ignored(t *testing.T) {
	p := NewPortfolio(100_000)
	p.OnTrade(&Trade{Price: 100.0, Size: 10.0, HumanInvolved: false})
	s := p.State(100.0)
	if s["holdings"].(float64) != 0.0 {
		t.Fatalf("non-human trade should not affect portfolio")
	}
	if s["cash"].(float64) != 100_000.0 {
		t.Fatalf("non-human trade should not affect cash")
	}
}
