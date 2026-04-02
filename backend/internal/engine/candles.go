package engine

import (
	"math"
	"sync"
	"time"
)

const maxCandles = 7200
const maxRecentTrades = 50

// TradeRecord is a minimal trade entry for the trade tape snapshot.
type TradeRecord struct {
	Price float64 `json:"price"`
	Size  float64 `json:"size"`
	Side  string  `json:"side"` // aggressor side: "buy" or "sell"
	Ts    int64   `json:"ts"`
}

// Candle represents a 1-second OHLCV bar.
type Candle struct {
	Time   int64   `json:"time"`   // Unix seconds (TradingView requirement)
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Volume float64 `json:"volume"`
}

// SessionStats is broadcast every second to the frontend asset bar.
type SessionStats struct {
	SessionOpen   float64 `json:"session_open"`
	SessionHigh   float64 `json:"session_high"`
	SessionLow    float64 `json:"session_low"`
	LastPrice     float64 `json:"last_price"`
	SessionVolume float64 `json:"session_volume"`
	ChangePct     float64 `json:"change_pct"`
	TradeCount    int64   `json:"trade_count"`
	VWAP          float64 `json:"vwap"`
	Ts            int64   `json:"ts"`
}

// CandleStore holds a ring buffer of 1-second candles.
// Thread-safe reads via RLock; writes from matching goroutine only.
type CandleStore struct {
	mu              sync.RWMutex
	candles         [maxCandles]Candle
	head            int // index of oldest candle
	count           int // number of valid candles
	currentSec      int64
	sessionOpen     float64
	sessionHigh     float64
	sessionLow      float64
	totalVolume     float64
	lastPrice       float64
	initialized     bool
	tradeCount      int64
	vwapNumerator   float64
	vwapDenominator float64
	recentTrades    [maxRecentTrades]TradeRecord
	recentTradeHead int
	recentTradeLen  int
}

func NewCandleStore(s0 float64) *CandleStore {
	return &CandleStore{
		sessionOpen: s0,
		sessionHigh: s0,
		sessionLow:  s0,
		lastPrice:   s0,
	}
}

// OnTrade updates the candle store with a new trade. Call from matching goroutine.
func (cs *CandleStore) OnTrade(price, size float64, side string) {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	nowSec := time.Now().Unix()
	cs.lastPrice = price
	cs.totalVolume += size
	cs.tradeCount++
	cs.vwapNumerator += price * size
	cs.vwapDenominator += size

	if price > cs.sessionHigh {
		cs.sessionHigh = price
	}
	if price < cs.sessionLow || !cs.initialized {
		cs.sessionLow = price
	}
	cs.initialized = true

	if cs.currentSec != nowSec {
		cs.currentSec = nowSec
		writeIdx := (cs.head + cs.count) % maxCandles
		cs.candles[writeIdx] = Candle{
			Time:   nowSec,
			Open:   price,
			High:   price,
			Low:    price,
			Close:  price,
			Volume: size,
		}
		if cs.count < maxCandles {
			cs.count++
		} else {
			cs.head = (cs.head + 1) % maxCandles
		}
	} else {
		// Update current candle (last written)
		writeIdx := (cs.head + cs.count - 1 + maxCandles) % maxCandles
		c := &cs.candles[writeIdx]
		if price > c.High {
			c.High = price
		}
		if price < c.Low {
			c.Low = price
		}
		c.Close = price
		c.Volume += size
	}

	// append to recent trades ring buffer (mutex already held)
	idx := (cs.recentTradeHead + cs.recentTradeLen) % maxRecentTrades
	cs.recentTrades[idx] = TradeRecord{Price: price, Size: size, Side: side, Ts: time.Now().UnixMilli()}
	if cs.recentTradeLen < maxRecentTrades {
		cs.recentTradeLen++
	} else {
		cs.recentTradeHead = (cs.recentTradeHead + 1) % maxRecentTrades
	}
}

// RecentTrades returns up to the last 50 trades in chronological order. Thread-safe.
func (cs *CandleStore) RecentTrades() []TradeRecord {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	if cs.recentTradeLen == 0 {
		return nil
	}
	out := make([]TradeRecord, cs.recentTradeLen)
	for i := 0; i < cs.recentTradeLen; i++ {
		out[i] = cs.recentTrades[(cs.recentTradeHead+i)%maxRecentTrades]
	}
	return out
}

// Snapshot returns the last n candles in chronological order. Thread-safe.
func (cs *CandleStore) Snapshot(n int) []Candle {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	if cs.count == 0 {
		return nil
	}
	if n > cs.count {
		n = cs.count
	}
	out := make([]Candle, n)
	start := (cs.head + cs.count - n + maxCandles) % maxCandles
	for i := 0; i < n; i++ {
		out[i] = cs.candles[(start+i)%maxCandles]
	}
	return out
}

// Stats returns current session statistics. Thread-safe.
func (cs *CandleStore) Stats() SessionStats {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	changePct := 0.0
	if cs.sessionOpen > 0 {
		changePct = math.Round(((cs.lastPrice-cs.sessionOpen)/cs.sessionOpen)*10000) / 100
	}
	vwap := 0.0
	if cs.vwapDenominator > 0 {
		vwap = math.Round((cs.vwapNumerator/cs.vwapDenominator)*10000) / 10000
	}
	return SessionStats{
		SessionOpen:   cs.sessionOpen,
		SessionHigh:   cs.sessionHigh,
		SessionLow:    cs.sessionLow,
		LastPrice:     cs.lastPrice,
		SessionVolume: math.Round(cs.totalVolume*100) / 100,
		ChangePct:     changePct,
		TradeCount:    cs.tradeCount,
		VWAP:          vwap,
		Ts:            time.Now().UnixMilli(),
	}
}
