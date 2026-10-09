const test = require('node:test')
const assert = require('node:assert')
const { JobQueue } = require('../src/queue')

test('runs jobs and returns their results', async () => {
  const q = new JobQueue({ concurrency: 1 })
  const out = await Promise.all([1, 2, 3].map(n => q.push(async () => n * 2)))
  assert.deepStrictEqual(out, [2, 4, 6])
  await q.drain()
  assert.deepStrictEqual(await q.stats(), { completed: 3, failed: 0, retried: 0 })
})

test('retries a failing job', async () => {
  const q = new JobQueue({ retries: 2 })
  let calls = 0
  const v = await q.push(async () => { if (++calls < 3) throw new Error('flaky'); return 'ok' })
  assert.strictEqual(v, 'ok')
  assert.deepStrictEqual(await q.stats(), { completed: 1, failed: 0, retried: 2 })
})
