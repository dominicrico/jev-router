const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const db = require('../src/db')
const orders = require('../src/orders')
const checkout = require('../src/checkout')
const admin = require('../src/admin')

const { placeOrder, cancelOrder, getOrder, OutOfStock } = orders
const L = (sku, qty) => ({ sku, qty })

test.beforeEach(() => db.reset())
// The invariant: 0 <= reserved <= stock for every sku, after every operation.
const invariant = () => { for (const sku of Object.keys(db.stock)) assert.ok(0 <= (db.reserved[sku] ?? 0) && (db.reserved[sku] ?? 0) <= db.stock[sku], `invariant broken for ${sku}: reserved ${db.reserved[sku]} stock ${db.stock[sku]}`) }
const frozen = () => JSON.stringify([db.stock, db.reserved])

test('structure: only inventory.js touches the stock and reserved tables', () => {
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  for (const f of ['orders.js', 'checkout.js', 'admin.js']) {
    const src = strip(fs.readFileSync(path.join(__dirname, '../src', f), 'utf8'))
    assert.ok(!/\bdb\s*\.\s*(stock|reserved)\b/.test(src), `${f} still touches db.stock or db.reserved`)
    assert.ok(!/\bdb\s*\[\s*['"](stock|reserved)/.test(src), `${f} still indexes db`)
    assert.ok(!/\{[^}]*\b(stock|reserved)\b[^}]*\}\s*=\s*(require\(['"]\.\/db(\.js)?['"]\)|db\b)/.test(src), `${f} destructures stock or reserved from db`)
    assert.ok(!/require\(['"]\.\/db(\.js)?['"]\)\s*\.\s*(stock|reserved)\b/.test(src), `${f} reads the tables through require`)
  }
  const inv = require('../src/inventory')
  for (const fn of ['reserve', 'release', 'commit', 'restock', 'writeOff', 'available', 'snapshot']) assert.strictEqual(typeof inv[fn], 'function', `inventory.${fn}`)
  assert.strictEqual(inv.OutOfStock, OutOfStock, 'orders.OutOfStock is the class inventory throws')
})

test('public API of the three modules is unchanged', () => {
  assert.deepStrictEqual(Object.keys(orders).sort(), ['OutOfStock', 'cancelOrder', 'getOrder', 'placeOrder'])
  assert.deepStrictEqual(Object.keys(checkout).sort(), ['TTL_MS', 'confirmOrder', 'expireOrders'])
  assert.deepStrictEqual(Object.keys(admin).sort(), ['report', 'restock', 'writeOff'])
})

test('duplicate lines for one sku are added up before checking', () => {
  assert.throws(() => placeOrder('a', [L('widget', 6), L('widget', 6)]), OutOfStock)
  assert.strictEqual(frozen(), JSON.stringify([db.stock, {}]))
  assert.strictEqual(db.orders.size, 0)
  const o = placeOrder('b', [L('widget', 6), L('widget', 4)])
  assert.strictEqual(db.reserved.widget, 10)
  assert.deepStrictEqual(o.lines, [L('widget', 10)])
  invariant()
})

test('an order is all or nothing', () => {
  assert.throws(() => placeOrder('a', [L('widget', 3), L('gizmo', 3)]), OutOfStock)
  assert.throws(() => placeOrder('b', [L('widget', 3), L('nope', 1)]), /unknown sku/)
  assert.throws(() => placeOrder('c', [L('widget', 3), L('gadget', 0)]), RangeError)
  assert.throws(() => placeOrder('d', [L('widget', 3), L('gadget', 1.5)]), RangeError)
  assert.strictEqual(db.reserved.widget ?? 0, 0)
  assert.strictEqual(db.orders.size, 0)
  invariant()
})

test('cancelling twice releases once; a confirmed order cannot be cancelled', () => {
  placeOrder('a', [L('widget', 4)])
  placeOrder('b', [L('widget', 3)])
  cancelOrder('a'); cancelOrder('a')
  assert.strictEqual(db.reserved.widget, 3)
  checkout.confirmOrder('b')
  assert.throws(() => cancelOrder('b'), /cannot cancel/)
  assert.deepStrictEqual([db.stock.widget, db.reserved.widget], [7, 0])
  assert.throws(() => checkout.confirmOrder('b'), /cannot confirm/)
  assert.throws(() => checkout.confirmOrder('a'), /cannot confirm/)
  assert.deepStrictEqual([db.stock.widget, db.reserved.widget], [7, 0])
  invariant()
})

test('expiry only releases old pending orders, once', () => {
  const t0 = Date.now()
  placeOrder('old', [L('gadget', 2)])
  placeOrder('shipped', [L('gadget', 2)])
  checkout.confirmOrder('shipped')
  placeOrder('young', [L('gadget', 1)])
  db.orders.get('old').createdAt = t0 - checkout.TTL_MS - 1
  db.orders.get('shipped').createdAt = t0 - checkout.TTL_MS - 1
  assert.deepStrictEqual(checkout.expireOrders(t0), ['old'])
  assert.deepStrictEqual(checkout.expireOrders(t0), [])
  assert.deepStrictEqual([db.stock.gadget, db.reserved.gadget], [3, 1])
  assert.strictEqual(getOrder('old').status, 'expired')
  assert.throws(() => checkout.confirmOrder('old'), /cannot confirm/)
  assert.doesNotThrow(() => cancelOrder('young'))
  assert.throws(() => cancelOrder('old'), /cannot cancel/)
  invariant()
})

test('write-offs and restocks keep reservations covered', () => {
  placeOrder('a', [L('widget', 7)])
  assert.throws(() => admin.writeOff('widget', 4), /would break reservations/)
  assert.strictEqual(db.stock.widget, 10)
  assert.strictEqual(admin.writeOff('widget', 3), 7)
  assert.throws(() => admin.writeOff('nope', 1), /unknown sku/)
  assert.throws(() => admin.writeOff('widget', 0), RangeError)
  assert.strictEqual(admin.restock('newthing', 5), 5)
  assert.throws(() => admin.restock('widget', -1), RangeError)
  assert.deepStrictEqual(admin.report().find(r => r.sku === 'widget'), { sku: 'widget', stock: 7, reserved: 7, available: 0 })
  placeOrder('b', [L('newthing', 5)])
  invariant()
})

test('randomised flow keeps the invariant', () => {
  let seed = 7
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
  const skus = ['widget', 'gadget', 'gizmo']
  const ids = []
  let shipped = 0
  for (let step = 0; step < 300; step++) {
    const r = rand()
    try {
      if (r < 0.4) { const id = `o${step}`; const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => L(skus[Math.floor(rand() * 3)], 1 + Math.floor(rand() * 4))); placeOrder(id, lines); ids.push(id) }
      else if (r < 0.6 && ids.length) { const id = ids[Math.floor(rand() * ids.length)]; const before = getOrder(id).status; checkout.confirmOrder(id); if (before === 'pending') shipped += getOrder(id).lines.reduce((a, l) => a + l.qty, 0) }
      else if (r < 0.75 && ids.length) cancelOrder(ids[Math.floor(rand() * ids.length)])
      else if (r < 0.85) admin.restock(skus[Math.floor(rand() * 3)], 1 + Math.floor(rand() * 5))
      else if (r < 0.92) admin.writeOff(skus[Math.floor(rand() * 3)], 1 + Math.floor(rand() * 3))
      else checkout.expireOrders(Date.now() + checkout.TTL_MS + 1)
    } catch (e) { assert.ok(e instanceof Error) }
    invariant()
  }
  assert.ok(shipped > 0)
})
