const PRICES = { apple: 120, pear: 150, melon: 400, kiwi: 90 }

function unitPrice(sku) {
  if (!(sku in PRICES)) throw new Error(`unknown sku ${sku}`)
  return PRICES[sku]
}

// 10% off from 10 units up.
function bulkDiscount(qty) {
  return qty > 10 ? 0.1 : 0
}

function lineTotal(sku, qty) {
  return Math.round(unitPrice(sku) * qty * (1 - bulkDiscount(qty)))
}

module.exports = { unitPrice, bulkDiscount, lineTotal }
