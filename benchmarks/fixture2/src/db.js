// The "database": plain in-memory tables.
const SEED = { widget: 10, gadget: 5, gizmo: 2 }

const stock = {}    // sku -> units on hand
const reserved = {} // sku -> units promised to pending orders, never more than on hand
const orders = new Map()

function reset(seed = SEED) {
  for (const t of [stock, reserved]) for (const k of Object.keys(t)) delete t[k]
  Object.assign(stock, seed)
  orders.clear()
}
reset()

module.exports = { stock, reserved, orders, reset }
