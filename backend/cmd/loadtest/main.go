// loadtest hammers a running backend with concurrent POST /orders traffic
// and WebSocket clients. Example:
//
//	go run ./cmd/loadtest -url http://localhost:8080 -ws ws://localhost:8080/ws \
//	  -concurrency 200 -duration 10s -ws-clients 500
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"math/rand/v2"
	"net/http"
	"os"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
	"github.com/google/uuid"
)

type result struct {
	latencies []time.Duration
	mu        sync.Mutex
	ok200     atomic.Int64
	badReq400 atomic.Int64
	busy503   atomic.Int64
	other     atomic.Int64
	netErrors atomic.Int64
}

func (r *result) record(d time.Duration, status int) {
	switch status {
	case 0:
		r.netErrors.Add(1)
	case http.StatusOK:
		r.ok200.Add(1)
	case http.StatusBadRequest:
		r.badReq400.Add(1)
	case http.StatusServiceUnavailable:
		r.busy503.Add(1)
	default:
		r.other.Add(1)
	}
	r.mu.Lock()
	r.latencies = append(r.latencies, d)
	r.mu.Unlock()
}

func percentile(sorted []time.Duration, p float64) time.Duration {
	if len(sorted) == 0 {
		return 0
	}
	idx := int(p * float64(len(sorted)-1))
	return sorted[idx]
}

func runHTTPLoad(baseURL string, concurrency int, duration time.Duration) {
	fmt.Printf("\n=== HTTP order-placement load: %d concurrent workers for %v ===\n", concurrency, duration)

	client := &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        concurrency * 2,
			MaxIdleConnsPerHost: concurrency * 2,
			IdleConnTimeout:     30 * time.Second,
		},
	}

	res := &result{}
	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), duration)
	defer cancel()

	// Reuse a pool of sessions so we don't burn one account's cash in a
	// few ms, and so the portfolio registry doesn't grow unbounded.
	poolSize := concurrency * 20
	if poolSize > 5000 {
		poolSize = 5000
	}
	sessionPool := make([]string, poolSize)
	for i := range sessionPool {
		sessionPool[i] = uuid.NewString()
	}

	for w := 0; w < concurrency; w++ {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
				}

				var body []byte
				side := "buy"
				if rand.Float64() < 0.5 {
					side = "sell"
				}
				if rand.Float64() < 0.7 {
					price := 90 + rand.Float64()*20
					body, _ = json.Marshal(map[string]any{
						"type": "limit", "side": side,
						"price": price, "size": 1 + rand.Float64()*4,
					})
				} else {
					body, _ = json.Marshal(map[string]any{
						"type": "market", "side": side, "size": 0.5 + rand.Float64()*1.5,
					})
				}

				req, _ := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/orders", bytes.NewReader(body))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("X-Session-ID", sessionPool[rand.IntN(len(sessionPool))])

				start := time.Now()
				resp, err := client.Do(req)
				elapsed := time.Since(start)
				status := 0
				if err == nil && resp != nil {
					status = resp.StatusCode
				}
				if resp != nil {
					resp.Body.Close()
				}
				res.record(elapsed, status)
			}
		}(w)
	}

	wg.Wait()

	res.mu.Lock()
	sorted := append([]time.Duration(nil), res.latencies...)
	res.mu.Unlock()
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })

	total := int64(len(sorted))
	rate := float64(total) / duration.Seconds()

	fmt.Printf("total requests:   %d (%.0f req/sec)\n", total, rate)
	fmt.Printf("  200 accepted:          %d\n", res.ok200.Load())
	fmt.Printf("  400 bad request:       %d\n", res.badReq400.Load())
	fmt.Printf("  503 overloaded:        %d\n", res.busy503.Load())
	fmt.Printf("  other/network errors:  %d\n", res.other.Load()+res.netErrors.Load())
	if len(sorted) > 0 {
		fmt.Printf("latency  min/p50/p90/p99/max: %v / %v / %v / %v / %v\n",
			sorted[0], percentile(sorted, 0.50), percentile(sorted, 0.90), percentile(sorted, 0.99), sorted[len(sorted)-1])
	}
}

func runWSLoad(wsURL string, numClients int, duration time.Duration) {
	fmt.Printf("\n=== WebSocket fan-out load: %d concurrent clients for %v ===\n", numClients, duration)

	var totalMsgs atomic.Int64
	var bookMsgs atomic.Int64
	latMu := sync.Mutex{}
	var bookLatencies []time.Duration

	ctx, cancel := context.WithTimeout(context.Background(), duration+3*time.Second)
	defer cancel()

	var wg sync.WaitGroup
	var connected atomic.Int64
	for i := 0; i < numClients; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			sessionID := uuid.NewString()
			url := fmt.Sprintf("%s?session=%s", wsURL, sessionID)
			conn, _, err := websocket.Dial(ctx, url, nil)
			if err != nil {
				return
			}
			connected.Add(1)
			defer conn.CloseNow()
			conn.SetReadLimit(1 << 20)

			deadline := time.Now().Add(duration)
			for time.Now().Before(deadline) {
				readCtx, cancelRead := context.WithTimeout(ctx, 2*time.Second)
				_, data, err := conn.Read(readCtx)
				cancelRead()
				if err != nil {
					return
				}
				recvAt := time.Now()
				totalMsgs.Add(1)

				var envelope struct {
					Type string `json:"type"`
					Ts   int64  `json:"ts"`
				}
				if json.Unmarshal(data, &envelope) == nil && envelope.Type == "book" {
					bookMsgs.Add(1)
					sentAt := time.UnixMilli(envelope.Ts)
					lat := recvAt.Sub(sentAt)
					latMu.Lock()
					bookLatencies = append(bookLatencies, lat)
					latMu.Unlock()
				}
			}
		}(i)
	}
	wg.Wait()

	fmt.Printf("clients connected: %d / %d\n", connected.Load(), numClients)
	fmt.Printf("total messages received: %d (%.0f msgs/sec aggregate)\n", totalMsgs.Load(), float64(totalMsgs.Load())/duration.Seconds())
	fmt.Printf("`book` frames received:  %d (%.0f msgs/sec aggregate)\n", bookMsgs.Load(), float64(bookMsgs.Load())/duration.Seconds())

	latMu.Lock()
	sorted := append([]time.Duration(nil), bookLatencies...)
	latMu.Unlock()
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	if len(sorted) > 0 {
		fmt.Printf("book delivery latency (server ts -> client receipt) min/p50/p90/p99/max: %v / %v / %v / %v / %v\n",
			sorted[0], percentile(sorted, 0.50), percentile(sorted, 0.90), percentile(sorted, 0.99), sorted[len(sorted)-1])
	}
}

func main() {
	url := flag.String("url", "http://localhost:8080", "backend base HTTP URL")
	wsURL := flag.String("ws", "ws://localhost:8080/ws", "backend WebSocket URL")
	concurrency := flag.Int("concurrency", 100, "concurrent HTTP order-placement workers")
	duration := flag.Duration("duration", 10*time.Second, "duration for each phase")
	wsClients := flag.Int("ws-clients", 200, "concurrent WebSocket clients")
	skipHTTP := flag.Bool("skip-http", false, "skip the HTTP order-placement phase")
	skipWS := flag.Bool("skip-ws", false, "skip the WebSocket fan-out phase")
	flag.Parse()

	resp, err := http.Get(*url + "/health")
	if err != nil || resp.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "backend not reachable at %s/health: %v\n", *url, err)
		os.Exit(1)
	}
	resp.Body.Close()

	if !*skipHTTP {
		runHTTPLoad(*url, *concurrency, *duration)
	}
	if !*skipWS {
		runWSLoad(*wsURL, *wsClients, *duration)
	}
}
