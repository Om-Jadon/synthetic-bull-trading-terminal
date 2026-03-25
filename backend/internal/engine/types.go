package engine

import "time"

type Side string

const (
	Buy  Side = "buy"
	Sell Side = "sell"
)

type OrderType string

const (
	TypeLimit  OrderType = "limit"
	TypeMarket OrderType = "market"
	TypeCancel OrderType = "cancel"
)

// Order represents any inbound order message
type Order struct {
	ID        string
	Type      OrderType
	Side      Side
	Price     float64 // 0 for market orders
	Size      float64
	Remaining float64
	UserID    string // "system" for GBM orders, "human" for human orders
	CreatedAt time.Time
}

// LevelOrder is a node in the FIFO doubly-linked list within a PriceLevel
type LevelOrder struct {
	Order *Order
	Prev  *LevelOrder
	Next  *LevelOrder
}

// PriceLevel holds all resting orders at a single price
type PriceLevel struct {
	Price  float64
	Volume float64 // sum of all Remaining sizes at this level
	Head   *LevelOrder
	Tail   *LevelOrder
}

// Trade is emitted when a match occurs
type Trade struct {
	ID            string
	Price         float64
	Size          float64
	BuyOrderID    string
	SellOrderID   string
	AggressorSide Side  // taker side — used for trade tape color
	HumanInvolved bool  // true if either party is the human user
	HumanIsBuyer  bool  // true if human is the buyer side
	Ts            int64 // Unix milliseconds
}

// OrderStatus values for order_update messages
const (
	StatusOpen      = "open"
	StatusPartial   = "partial"
	StatusFilled    = "filled"
	StatusCancelled = "cancelled"
)

// OrderUpdate is sent to human users when their order state changes
type OrderUpdate struct {
	OrderID       string  `json:"order_id"`
	Status        string  `json:"status"`
	FilledSize    float64 `json:"filled_size"`
	RemainingSize float64 `json:"remaining_size"`
	Price         float64 `json:"price"`
	Side          Side    `json:"side"`
	Ts            int64   `json:"ts"`
}

// EventType identifies what happened
type EventType string

const (
	EventTrade       EventType = "trade"
	EventOrderUpdate EventType = "order_update"
)

// Event flows from the matching engine outChan to the hub
type Event struct {
	Type        EventType
	Trade       *Trade
	OrderUpdate *OrderUpdate
}
