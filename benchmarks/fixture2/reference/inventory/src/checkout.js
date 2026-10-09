const db = require('./db')
const inventory = require('./inventory')

const TTL_MS = 15 * 60 * 1000

// Ships a pending order: the reserved units leave the shelf for good.
function confirmOrder(id) {
  const order = db.orders.get(id)
  if (!order) throw new Error(`no such order ${id}`)
  if (order.status !== 'pending') throw new Error(`cannot confirm a ${order.status} order`)
  inventory.commit(order.lines)
  order.status = 'confirmed'
  return order
}

// Pending orders older than the TTL give their reservation back. Returns the expired ids.
function expireOrders(now = Date.now(), ttlMs = TTL_MS) {
  const expired = []
  for (const order of db.orders.values()) {
    if (order.status !== 'pending' || now - order.createdAt < ttlMs) continue
    inventory.release(order.lines)
    order.status = 'expired'
    expired.push(order.id)
  }
  return expired
}

module.exports = { confirmOrder, expireOrders, TTL_MS }
