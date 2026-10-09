const db = require('./db')

function restock(sku, qty) {
  if (!Number.isInteger(qty) || qty <= 0) throw new RangeError(`bad quantity ${qty}`)
  db.stock[sku] = (db.stock[sku] ?? 0) + qty
  return db.stock[sku]
}

// Removes damaged units, but never units that a pending order is waiting for.
function writeOff(sku, qty) {
  if (!Number.isInteger(qty) || qty <= 0) throw new RangeError(`bad quantity ${qty}`)
  if (!(sku in db.stock)) throw new Error(`unknown sku ${sku}`)
  if (db.stock[sku] - qty < (db.reserved[sku] ?? 0)) throw new Error(`would break reservations for ${sku}`)
  db.stock[sku] -= qty
  return db.stock[sku]
}

function report() {
  return Object.keys(db.stock).sort().map(sku => ({ sku, stock: db.stock[sku], reserved: db.reserved[sku] ?? 0, available: db.stock[sku] - (db.reserved[sku] ?? 0) }))
}

module.exports = { restock, writeOff, report }
