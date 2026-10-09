const test = require('node:test')
const assert = require('node:assert')
const db = require('../src/db')
const { placeOrder, cancelOrder, OutOfStock } = require('../src/orders')
const { confirmOrder } = require('../src/checkout')
const { report } = require('../src/admin')

test.beforeEach(() => db.reset())

test('places and cancels an order', () => {
  placeOrder('a', [{ sku: 'widget', qty: 4 }])
  assert.strictEqual(report().find(r => r.sku === 'widget').available, 6)
  cancelOrder('a')
  assert.strictEqual(report().find(r => r.sku === 'widget').available, 10)
})

test('confirming takes the units off the shelf', () => {
  placeOrder('a', [{ sku: 'gizmo', qty: 2 }])
  confirmOrder('a')
  assert.deepStrictEqual(report().find(r => r.sku === 'gizmo'), { sku: 'gizmo', stock: 0, reserved: 0, available: 0 })
})

test('refuses more than is available', () => {
  assert.throws(() => placeOrder('a', [{ sku: 'gizmo', qty: 3 }]), OutOfStock)
})
