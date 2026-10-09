const test = require('node:test')
const assert = require('node:assert')
const { createStore } = require('../src/sessions')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

test('a custom ttl expires sessions', async () => {
  const store = createStore({ ttlMs: 30 })
  const id = store.create('ana')
  assert.strictEqual(store.get(id).user, 'ana')
  await sleep(30)
  assert.strictEqual(store.get(id), undefined)
})

test('default ttl keeps a fresh session alive', () => {
  const store = createStore()
  const id = store.create('bo')
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
