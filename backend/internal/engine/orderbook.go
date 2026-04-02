// internal/engine/orderbook.go
package engine

import (
	"github.com/google/btree"
)

// orderIndex lets us find a LevelOrder in O(1) for cancellation
type orderIndex struct {
	side       Side
	price      float64
	levelOrder *LevelOrder
}

type OrderBook struct {
	bids   *btree.BTreeG[*PriceLevel]
	asks   *btree.BTreeG[*PriceLevel]
	orders map[string]*orderIndex
}

func NewOrderBook() *OrderBook {
	return &OrderBook{
		// bids: descending — highest price has highest priority (min of the tree = best bid)
		bids: btree.NewG[*PriceLevel](32, func(a, b *PriceLevel) bool {
			return a.Price > b.Price
		}),
		// asks: ascending — lowest price has highest priority (min of the tree = best ask)
		asks: btree.NewG[*PriceLevel](32, func(a, b *PriceLevel) bool {
			return a.Price < b.Price
		}),
		orders: make(map[string]*orderIndex),
	}
}

// AddOrder adds a resting limit order to the book.
// Does NOT match — matching is the matcher's job.
func (ob *OrderBook) AddOrder(o *Order) {
	tree := ob.treeFor(o.Side)
	key := &PriceLevel{Price: o.Price}
	existing, ok := tree.Get(key)
	if !ok {
		existing = &PriceLevel{Price: o.Price}
		tree.ReplaceOrInsert(existing)
	}
	node := &LevelOrder{Order: o}
	if existing.Tail == nil {
		existing.Head = node
		existing.Tail = node
	} else {
		node.Prev = existing.Tail
		existing.Tail.Next = node
		existing.Tail = node
	}
	existing.Volume += o.Remaining
	ob.orders[o.ID] = &orderIndex{side: o.Side, price: o.Price, levelOrder: node}
}

// Cancel removes an order by ID. Returns false if not found.
func (ob *OrderBook) Cancel(orderID string) bool {
	idx, ok := ob.orders[orderID]
	if !ok {
		return false
	}
	delete(ob.orders, orderID)
	tree := ob.treeFor(idx.side)
	key := &PriceLevel{Price: idx.price}
	level, ok := tree.Get(key)
	if !ok {
		return true // already gone
	}
	node := idx.levelOrder
	level.Volume -= node.Order.Remaining
	// Remove node from doubly-linked list
	if node.Prev != nil {
		node.Prev.Next = node.Next
	} else {
		level.Head = node.Next
	}
	if node.Next != nil {
		node.Next.Prev = node.Prev
	} else {
		level.Tail = node.Prev
	}
	// Remove empty price level
	if level.Head == nil {
		tree.Delete(key)
	}
	return true
}

// BestBid returns the highest-priced bid level, or nil if empty.
func (ob *OrderBook) BestBid() *PriceLevel {
	level, ok := ob.bids.Min()
	if !ok {
		return nil
	}
	return level
}

// BestAsk returns the lowest-priced ask level, or nil if empty.
func (ob *OrderBook) BestAsk() *PriceLevel {
	level, ok := ob.asks.Min()
	if !ok {
		return nil
	}
	return level
}

// Depth returns the top N bid and ask levels as [price, size] pairs.
func (ob *OrderBook) Depth(n int) (bids, asks [][2]float64) {
	ob.bids.Ascend(func(level *PriceLevel) bool {
		if len(bids) >= n {
			return false
		}
		bids = append(bids, [2]float64{level.Price, level.Volume})
		return true
	})
	ob.asks.Ascend(func(level *PriceLevel) bool {
		if len(asks) >= n {
			return false
		}
		asks = append(asks, [2]float64{level.Price, level.Volume})
		return true
	})
	return
}

// ConsumeFromLevel removes `size` from the front of a price level's queue.
// Returns orders consumed (for trade creation). Updates the book accordingly.
// Caller must pass the actual level pointer from BestBid/BestAsk.
func (ob *OrderBook) ConsumeFromLevel(level *PriceLevel, side Side, size float64) []*Order {
	var consumed []*Order
	remaining := size
	tree := ob.treeFor(side)
	for remaining > 0 && level.Head != nil {
		node := level.Head
		o := node.Order
		fill := min(remaining, o.Remaining)
		o.Remaining -= fill
		level.Volume -= fill
		remaining -= fill
		if o.Remaining == 0 {
			// Remove from level queue
			level.Head = node.Next
			if level.Head != nil {
				level.Head.Prev = nil
			} else {
				level.Tail = nil
			}
			delete(ob.orders, o.ID)
		}
		consumed = append(consumed, o)
		if o.Remaining > 0 {
			break // partially consumed this order
		}
	}
	if level.Head == nil {
		tree.Delete(level)
	}
	return consumed
}

func (ob *OrderBook) treeFor(side Side) *btree.BTreeG[*PriceLevel] {
	if side == Buy {
		return ob.bids
	}
	return ob.asks
}


func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

