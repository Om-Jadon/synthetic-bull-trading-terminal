package hub

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"testing"
)

func init() {
	// Dropped-message logs drown out the bench timing.
	log.SetOutput(io.Discard)
}

func fakeClient(sessionID string) (*Client, <-chan int) {
	ctx, cancel := context.WithCancel(context.Background())
	c := &Client{
		send:      make(chan []byte, clientBufSize),
		ctx:       ctx,
		cancel:    cancel,
		sessionID: sessionID,
	}
	drained := make(chan int, 1)
	go func() {
		n := 0
		for range c.send {
			n++
		}
		drained <- n
	}()
	return c, drained
}

func bookPayload(levels int) []byte {
	bids := make([][2]float64, levels)
	asks := make([][2]float64, levels)
	for i := 0; i < levels; i++ {
		bids[i] = [2]float64{100 - float64(i)*0.01, 10}
		asks[i] = [2]float64{100 + float64(i)*0.01, 10}
	}
	b, _ := json.Marshal(map[string]any{
		"type": "book", "bids": bids, "asks": asks, "ts": 1,
	})
	return b
}

// Cost of fanning one book frame out to N clients (same loop as Hub.Run).
func benchmarkFanout(b *testing.B, numClients int) {
	h := New()
	clients := make([]*Client, numClients)
	drains := make([]<-chan int, numClients)
	for i := 0; i < numClients; i++ {
		c, drained := fakeClient(fmt.Sprintf("session-%d", i))
		clients[i] = c
		drains[i] = drained
		h.clients[c] = struct{}{}
	}
	msg := bookPayload(150)

	b.ReportAllocs()
	b.SetBytes(int64(len(msg)))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		h.mu.Lock()
		for c := range h.clients {
			select {
			case c.send <- msg:
			default:
			}
		}
		h.mu.Unlock()
	}
	b.StopTimer()

	for _, c := range clients {
		close(c.send)
	}
	for _, d := range drains {
		<-d
	}
}

func BenchmarkHub_Fanout_10Clients(b *testing.B)    { benchmarkFanout(b, 10) }
func BenchmarkHub_Fanout_100Clients(b *testing.B)   { benchmarkFanout(b, 100) }
func BenchmarkHub_Fanout_1000Clients(b *testing.B)  { benchmarkFanout(b, 1000) }
func BenchmarkHub_Fanout_10000Clients(b *testing.B) { benchmarkFanout(b, 10000) }

func BenchmarkHub_BroadcastPipeline(b *testing.B) {
	h := New()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go h.Run(ctx)

	const numClients = 200
	clients := make([]*Client, numClients)
	drains := make([]<-chan int, numClients)
	for i := 0; i < numClients; i++ {
		c, drained := fakeClient(fmt.Sprintf("session-%d", i))
		clients[i] = c
		drains[i] = drained
		h.register <- c
	}

	msg := bookPayload(150)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		h.Broadcast(msg)
	}
	b.StopTimer()

	for _, c := range clients {
		h.unregister <- c
	}
	for _, d := range drains {
		<-d
	}
}
