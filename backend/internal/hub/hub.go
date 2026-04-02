package hub

import (
	"context"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
)

const (
	clientBufSize  = 256
	directBufSize  = 512
	writeWait      = 10 * time.Second
	maxMessageSize = 4096
)

// DirectMsg is a targeted message for a specific session.
type DirectMsg struct {
	sessionID string
	payload   []byte
}

// Client represents a connected browser.
type Client struct {
	conn      *websocket.Conn
	send      chan []byte
	hub       *Hub
	ctx       context.Context
	cancel    context.CancelFunc
	sessionID string
}

// Hub manages all WebSocket clients and broadcasts messages.
type Hub struct {
	mu         sync.Mutex
	clients    map[*Client]struct{}
	broadcast  chan []byte
	direct     chan DirectMsg
	register   chan *Client
	unregister chan *Client
}

func New() *Hub {
	return &Hub{
		clients:    make(map[*Client]struct{}),
		broadcast:  make(chan []byte, 512),
		direct:     make(chan DirectMsg, directBufSize),
		register:   make(chan *Client, 16),
		unregister: make(chan *Client, 16),
	}
}

// Run is the hub's single broadcast goroutine. Call in a separate goroutine.
func (h *Hub) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case c := <-h.register:
			h.mu.Lock()
			h.clients[c] = struct{}{}
			h.mu.Unlock()
		case c := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.send)
			}
			h.mu.Unlock()
		case msg := <-h.broadcast:
			h.mu.Lock()
			for c := range h.clients {
				select {
				case c.send <- msg:
				default:
					// Slow client — disconnect
					delete(h.clients, c)
					close(c.send)
					c.cancel()
				}
			}
			h.mu.Unlock()
		case dm := <-h.direct:
			h.mu.Lock()
			for c := range h.clients {
				if c.sessionID != dm.sessionID {
					continue
				}
				select {
				case c.send <- dm.payload:
				default:
					delete(h.clients, c)
					close(c.send)
					c.cancel()
				}
			}
			h.mu.Unlock()
		}
	}
}

// Broadcast sends a pre-serialized message to all clients. Safe from any goroutine.
func (h *Hub) Broadcast(msg []byte) {
	select {
	case h.broadcast <- msg:
	default:
		log.Println("hub: broadcast channel full, dropping message")
	}
}

// Send delivers a message only to clients with the matching sessionID. Safe from any goroutine.
func (h *Hub) Send(sessionID string, msg []byte) {
	select {
	case h.direct <- DirectMsg{sessionID: sessionID, payload: msg}:
	default:
		log.Println("hub: direct channel full, dropping targeted message")
	}
}

// ServeWS upgrades an HTTP connection to WebSocket and registers the client.
// snapshotFn is called once on connect to send the initial snapshot.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request, sessionID string, snapshotFn func() []byte) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true, // allow any origin (competition demo)
	})
	if err != nil {
		log.Printf("ws accept error: %v", err)
		return
	}

	ctx, cancel := context.WithCancel(r.Context())
	c := &Client{
		conn:      conn,
		send:      make(chan []byte, clientBufSize),
		hub:       h,
		ctx:       ctx,
		cancel:    cancel,
		sessionID: sessionID,
	}
	h.register <- c

	// Send snapshot immediately on connect
	if snapshotFn != nil {
		if snap := snapshotFn(); snap != nil {
			c.send <- snap
		}
	}

	go c.writePump()
	c.readPump() // blocks until client disconnects
	h.unregister <- c
}

// readPump drains inbound messages (orders go via REST, not WS).
func (c *Client) readPump() {
	defer c.cancel()
	c.conn.SetReadLimit(maxMessageSize)
	for {
		_, _, err := c.conn.Read(c.ctx)
		if err != nil {
			return
		}
	}
}

// writePump drains the send channel and writes to the WebSocket.
func (c *Client) writePump() {
	defer c.conn.Close(websocket.StatusNormalClosure, "")
	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				return
			}
			ctx, cancel := context.WithTimeout(c.ctx, writeWait)
			err := c.conn.Write(ctx, websocket.MessageText, msg)
			cancel()
			if err != nil {
				return
			}
		case <-c.ctx.Done():
			return
		}
	}
}
