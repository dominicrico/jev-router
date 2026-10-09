const test = require('node:test')
const assert = require('node:assert')
const { JobQueue } = require('../src/queue')

const sleep = ms => new Promise(r => setTimeout(r, ms))

// A store that only promises get and set, with real latency, like a remote key-value service.
function slowStore(latency = 1) {
  const map = new Map()
  return {
    async get(k) { await sleep(latency); return map.get(k) ?? 0 },
    async set(k, v) { await sleep(latency); map.set(k, v) },
  }
}

test('no completed job is lost under concurrency', async () => {
  const q = new JobQueue({ concurrency: 8, store: slowStore() })
  await Promise.all(Array.from({ length: 40 }, () => q.push(() => sleep(3))))
  await q.drain()
  assert.deepStrictEqual(await q.stats(), { completed: 40, failed: 0, retried: 0 })
})

test('failures and retries are counted exactly', async () => {
  const q = new JobQueue({ concurrency: 6, retries: 1, store: slowStore() })
  const results = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => q.push(async () => { await sleep(2); if (i % 5 === 0) throw new Error('boom'); return i })))
  await q.drain()
  assert.strictEqual(results.filter(r => r.status === 'rejected').length, 6)
  assert.deepStrictEqual(await q.stats(), { completed: 24, failed: 6, retried: 6 })
})

test('two queues sharing one store do not overwrite each other', async () => {
  const store = slowStore()
  const a = new JobQueue({ concurrency: 5, store }), b = new JobQueue({ concurrency: 5, store })
  await Promise.all([
    ...Array.from({ length: 20 }, () => a.push(() => sleep(2))),
    ...Array.from({ length: 20 }, () => b.push(() => sleep(2))),
  ])
  await Promise.all([a.drain(), b.drain()])
  assert.strictEqual((await a.stats()).completed, 40)
})

test('an awaited job result implies its stat is already recorded', async () => {
  const q = new JobQueue({ concurrency: 4, store: slowStore() })
  await Promise.all(Array.from({ length: 12 }, () => q.push(() => sleep(1))))
  assert.strictEqual((await q.stats()).completed, 12)
})

test('still runs jobs in parallel up to the limit, never above it', async () => {
  const q = new JobQueue({ concurrency: 5, store: slowStore() })
  let live = 0, peak = 0
  const t0 = Date.now()
  await Promise.all(Array.from({ length: 25 }, () => q.push(async () => { live++; peak = Math.max(peak, live); await sleep(20); live-- })))
  const elapsed = Date.now() - t0
  await q.drain()
  assert.strictEqual(peak, 5)
  assert.ok(elapsed < 25 * 20 / 2, `stats updates must not serialise the jobs themselves (took ${elapsed}ms)`)
  assert.strictEqual((await q.stats()).completed, 25)
})

test('a failing store does not wedge later updates', async () => {
  let failNext = true
  const map = new Map()
  const store = {
    async get(k) { await sleep(1); return map.get(k) ?? 0 },
    async set(k, v) { await sleep(1); if (failNext && k === 'completed') { failNext = false; throw new Error('store down') } map.set(k, v) },
  }
  const q = new JobQueue({ concurrency: 3, store })
  const settled = await Promise.allSettled(Array.from({ length: 6 }, () => q.push(() => sleep(1))))
  await q.drain()
  assert.ok(settled.length === 6)
  assert.ok((await q.stats()).completed >= 4, 'later stat updates still go through after one store error')
})
