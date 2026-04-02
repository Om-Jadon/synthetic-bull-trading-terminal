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
	UserID    string // "system" for GBM orders, session UUID for human orders, bot ID for bots
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
	AggressorSide Side   // taker side — used for trade tape color
	BuyerUserID   string // userID of the buyer
	SellerUserID  string // userID of the seller
	Ts            int64  // Unix milliseconds
}

// OrderStatus values for order_update messages
const (
	StatusOpen      = "open"
	StatusPartial   = "partial"
	StatusFilled    = "filled"
	StatusCancelled = "cancelled"
)

// OrderUpdate is sent to session users when their order state changes
type OrderUpdate struct {
	UserID        string  `json:"-"` // session ID of the order owner — used for routing, not serialized
	OrderID       string  `json:"order_id"`
	Status        string  `json:"status"`
	FilledSize    float64 `json:"filled_size"`
	RemainingSize float64 `json:"remaining_size"`
	Price         float64 `json:"price"`
	Side          Side    `json:"side"`
	Ts            int64   `json:"ts"`
}

// EquityPoint is one data point in the equity curve.
type EquityPoint struct {
	Ts    int64   `json:"ts"`
	Value float64 `json:"value"`
}

// FillRecord is a completed human fill stored for chart markers.
type FillRecord struct {
	Ts    int64   `json:"ts"`
	Price float64 `json:"price"`
	Side  Side    `json:"side"`
	Size  float64 `json:"size"`
}

// ActivityRecord is one entry in the human order activity log.
type ActivityRecord struct {
	OrderID       string  `json:"order_id"`
	Status        string  `json:"status"`
	FilledSize    float64 `json:"filled_size"`
	RemainingSize float64 `json:"remaining_size"`
	Price         float64 `json:"price"`
	Side          Side    `json:"side"`
	Ts            int64   `json:"ts"`
}

