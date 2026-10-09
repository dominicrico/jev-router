const { lineTotal } = require('./pricing')
const { taxFor } = require('./tax')

const fmt = cents => `$${(cents / 100).toFixed(2)}`

// items: [{ sku, qty }]
function calcTotal(items) {
  const lines = new Map()
  for (const { sku, qty } of items) lines.set(sku, qty)
  let subtotal = 0
  for (const [sku, qty] of lines) subtotal += lineTotal(sku, qty)
  const shipping = subtotal >= 5000 ? 0 : 500
  const tax = taxFor(subtotal)
  return { subtotal, shipping, tax, total: subtotal + shipping + tax, label: fmt(subtotal + shipping + tax) }
}

module.exports = { calcTotal }
