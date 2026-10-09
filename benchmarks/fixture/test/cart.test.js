const test = require('node:test')
const assert = require('node:assert')
const { calcTotal } = require('../src/cart')
const { bulkDiscount } = require('../src/pricing')
const { summary } = require('../src/report')
const { formatMoney } = require('../src/format')

test('totals a simple cart', () => {
  const t = calcTotal([{ sku: 'apple', qty: 2 }, { sku: 'pear', qty: 1 }])
  assert.strictEqual(t.subtotal, 390)
  assert.strictEqual(t.shipping, 500)
})

test('free shipping from 50.00', () => {
  assert.strictEqual(calcTotal([{ sku: 'melon', qty: 14 }]).shipping, 0)
})

test('applies the bulk discount at exactly 10 units', () => {
  assert.strictEqual(bulkDiscount(10), 0.1)
})

test('summary line', () => {
  assert.match(summary([{ sku: 'kiwi', qty: 1 }]), /total \$/)
})

test('formats money', () => {
  assert.strictEqual(formatMoney(1234), '$12.34')
})
