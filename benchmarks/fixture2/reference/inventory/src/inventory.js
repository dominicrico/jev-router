const db = require('./db')

class OutOfStock extends Error {
  constructor(sku) { super(`out of stock: ${sku}`); this.name = 'OutOfStock'; this.sku = sku }
}

const held = sku => db.reserved[sku] ?? 0
const available = sku => (sku in db.stock ? db.stock[sku] - held(sku) : 0)

function aggregate(lines) {
  const need = new Map()
  for (const { sku, qty } of lines) need.set(sku, (need.get(sku) ?? 0) + qty)
  return need
}

// All or nothing. Returns the merged lines that were reserved.
function reserve(lines) {
  for (const { qty } of lines) if (!Number.isInteger(qty) || qty <= 0) throw new RangeError(`bad quantity ${qty}`)
  const need = aggregate(lines)
  for (const [sku, qty] of need) {
    if (!(sku in db.stock)) throw new Error(`unknown sku ${sku}`)
    if (available(sku) < qty) throw new OutOfStock(sku)
  }
  for (const [sku, qty] of need) db.reserved[sku] = held(sku) + qty
  return [...need].map(([sku, qty]) => ({ sku, qty }))
}

function release(lines) {
  for (const { sku, qty } of lines) db.reserved[sku] -= qty
}

function commit(lines) {
  for (const { sku, qty } of lines) {
    db.stock[sku] -= qty
    db.reserved[sku] -= qty
  }
}

function restock(sku, qty) {
  if (!Number.isInteger(qty) || qty <= 0) throw new RangeError(`bad quantity ${qty}`)
  db.stock[sku] = (db.stock[sku] ?? 0) + qty
  return db.stock[sku]
}

function writeOff(sku, qty) {
  if (!Number.isInteger(qty) || qty <= 0) throw new RangeError(`bad quantity ${qty}`)
  if (!(sku in db.stock)) throw new Error(`unknown sku ${sku}`)
  if (db.stock[sku] - qty < held(sku)) throw new Error(`would break reservations for ${sku}`)
  db.stock[sku] -= qty
  return db.stock[sku]
}

function snapshot() {
  return Object.keys(db.stock).sort().map(sku => ({ sku, stock: db.stock[sku], reserved: held(sku), available: available(sku) }))
}

module.exports = { OutOfStock, reserve, release, commit, restock, writeOff, available, snapshot }
