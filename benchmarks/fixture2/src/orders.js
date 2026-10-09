const db = require('./db')

class OutOfStock extends Error {
  constructor(sku) { super(`out of stock: ${sku}`); this.name = 'OutOfStock'; this.sku = sku }
}

// Duplicate skus in one order add up.
function aggregate(lines) {
  const need = new Map()
  for (const { sku, qty } of lines) need.set(sku, (need.get(sku) ?? 0) + qty)
  return need
}

// Reserves every line or none of them.
function placeOrder(id, lines) {
  if (db.orders.has(id)) throw new Error(`duplicate order ${id}`)
  for (const { qty } of lines) if (!Number.isInteger(qty) || qty <= 0) throw new RangeError(`bad quantity ${qty}`)
  const need = aggregate(lines)
  for (const [sku, qty] of need) {
    if (!(sku in db.stock)) throw new Error(`unknown sku ${sku}`)
    if (db.stock[sku] - (db.reserved[sku] ?? 0) < qty) throw new OutOfStock(sku)
  }
  for (const [sku, qty] of need) db.reserved[sku] = (db.reserved[sku] ?? 0) + qty
  const order = { id, lines: [...need].map(([sku, qty]) => ({ sku, qty })), status: 'pending', createdAt: Date.now() }
  db.orders.set(id, order)
  return order
}

// Cancelling twice is fine; a confirmed order cannot be cancelled.
function cancelOrder(id) {
  const order = db.orders.get(id)
  if (!order) throw new Error(`no such order ${id}`)
  if (order.status === 'cancelled') return order
  if (order.status !== 'pending') throw new Error(`cannot cancel a ${order.status} order`)
  for (const { sku, qty } of order.lines) db.reserved[sku] -= qty
  order.status = 'cancelled'
  return order
}

function getOrder(id) {
  return db.orders.get(id)
}

module.exports = { placeOrder, cancelOrder, getOrder, OutOfStock }
