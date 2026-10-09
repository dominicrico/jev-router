const db = require('./db')
const inventory = require('./inventory')

const { OutOfStock } = inventory

function placeOrder(id, lines) {
  if (db.orders.has(id)) throw new Error(`duplicate order ${id}`)
  const reserved = inventory.reserve(lines)
  const order = { id, lines: reserved, status: 'pending', createdAt: Date.now() }
  db.orders.set(id, order)
  return order
}

// Cancelling twice is fine; a confirmed order cannot be cancelled.
function cancelOrder(id) {
  const order = db.orders.get(id)
  if (!order) throw new Error(`no such order ${id}`)
  if (order.status === 'cancelled') return order
  if (order.status !== 'pending') throw new Error(`cannot cancel a ${order.status} order`)
  inventory.release(order.lines)
  order.status = 'cancelled'
  return order
}

function getOrder(id) {
  return db.orders.get(id)
}

module.exports = { placeOrder, cancelOrder, getOrder, OutOfStock }
