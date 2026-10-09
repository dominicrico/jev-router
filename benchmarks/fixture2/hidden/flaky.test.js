const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { createStore } = require('../src/sessions')

let now = 5_000_000
test.beforeEach(t => { now = 5_000_000; t.mock.method(Date, 'now', () => now) })

test('options of one store never leak into another', () => {
  createStore({ ttlMs: 5, sliding: true })
  const b = createStore()
  assert.strictEqual(b.config.ttlMs, 1000)
  assert.strictEqual(b.config.sliding, false)
  const id = b.create('x')
  now += 999
  assert.ok(b.get(id))
  now += 1
  assert.strictEqual(b.get(id), undefined)
  createStore({ ttlMs: 7 })
  const c = createStore({ sliding: true })
  assert.strictEqual(c.config.ttlMs, 1000)
})

test('a session expires exactly at createdAt + ttlMs', () => {
  const s = createStore({ ttlMs: 100 })
  const id = s.create('u')
  now += 99
  assert.ok(s.get(id))
  now += 1
  assert.strictEqual(s.get(id), undefined)
  assert.strictEqual(s.size, 0)
})

test('sliding sessions restart on use', () => {
  const s = createStore({ ttlMs: 100, sliding: true })
  const id = s.create('u')
  for (let i = 0; i < 5; i++) { now += 60; assert.ok(s.get(id), `step ${i}`) }
  now += 100
  assert.strictEqual(s.get(id), undefined)
})

test('ids are unique even when thousands are created in the same millisecond', () => {
  const s = createStore()
  const ids = new Set()
  for (let i = 0; i < 5000; i++) ids.add(s.create(`u${i}`))
  assert.strictEqual(ids.size, 5000)
  assert.strictEqual(s.size, 5000)
  for (const id of ids) assert.strictEqual(typeof id, 'string')
})

test('the visible test file no longer depends on real time and kept its coverage', () => {
  const file = path.join(__dirname, '../test/sessions.test.js')
  const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  assert.ok(!/setTimeout|setInterval|setImmediate|\bsleep\s*\(|timers\/promises/.test(src), 'test must not wait on real timers')
  assert.ok((src.match(/\btest\s*\(/g) ?? []).length >= 4, 'tests were deleted')
  assert.ok(/ttlMs/.test(src) && /createStore\(\s*\)/.test(src), 'both the custom and the default ttl paths stay tested')
  assert.ok(!/\.skip|\bskip\s*:|\btodo\b/i.test(src), 'tests were skipped')
})
