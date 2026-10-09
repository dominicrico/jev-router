const test = require('node:test')
const assert = require('node:assert')
const { createStore } = require('../src/sessions')

// Time is controlled, never slept.
let now = 1_000_000
test.beforeEach(t => { now = 1_000_000; t.mock.method(Date, 'now', () => now) })

test('a custom ttl expires sessions', () => {
  const store = createStore({ ttlMs: 30 })
  const id = store.create('ana')
  assert.strictEqual(store.get(id).user, 'ana')
  now += 30
  assert.strictEqual(store.get(id), undefined)
})

test('default ttl keeps a fresh session alive', () => {
  createStore({ ttlMs: 30 })
  const store = createStore()
  const id = store.create('bo')
  now += 500
  assert.strictEqual(store.get(id)?.user, 'bo')
})

test('each session gets its own id', () => {
  const store = createStore()
  const ids = [store.create('a'), store.create('b'), store.create('c')]
  assert.strictEqual(new Set(ids).size, 3)
  assert.strictEqual(store.size, 3)
})

test('destroy removes a session', () => {
  const store = createStore()
  const id = store.create('dee')
  assert.ok(store.destroy(id))
  assert.strictEqual(store.get(id), undefined)
})
