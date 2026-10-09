const { MemoryStore } = require('./store')

// Stores only promise get and set, and one store can back several queues, so read-modify-write
// updates are serialised per store, not per queue.
const tails = new WeakMap()
function exclusive(store, fn) {
  const run = (tails.get(store) ?? Promise.resolve()).then(fn)
  tails.set(store, run.catch(() => {}))
  return run
}

// Runs async jobs with at most `concurrency` in flight. A failing job is retried up to `retries` times.
class JobQueue {
  constructor({ concurrency = 2, retries = 0, store = new MemoryStore() } = {}) {
    this.concurrency = concurrency
    this.retries = retries
    this.store = store
    this.waiting = []
    this.active = 0
    this.idle = []
  }

  // Resolves with the job's result once it succeeded, rejects with its last error once retries ran out.
  push(job) {
    return new Promise((resolve, reject) => {
      this.waiting.push({ job, resolve, reject })
      this.pump()
    })
  }

  // Resolves when nothing is waiting or running and every stat has been written.
  drain() {
    if (this.active === 0 && this.waiting.length === 0) return Promise.resolve()
    return new Promise(resolve => this.idle.push(resolve))
  }

  async stats() {
    return {
      completed: await this.store.get('completed'),
      failed: await this.store.get('failed'),
      retried: await this.store.get('retried'),
    }
  }

  pump() {
    while (this.active < this.concurrency && this.waiting.length) {
      const item = this.waiting.shift()
      this.active++
      this.execute(item).finally(() => {
        this.active--
        this.pump()
        if (this.active === 0 && this.waiting.length === 0) this.idle.splice(0).forEach(resolve => resolve())
      })
    }
  }

  async execute({ job, resolve, reject }) {
    for (let attempt = 0; ; attempt++) {
      try {
        const value = await job()
        await this.bump('completed')
        return resolve(value)
      } catch (err) {
        if (attempt < this.retries) { await this.bump('retried'); continue }
        await this.bump('failed')
        return reject(err)
      }
    }
  }

  bump(key) {
    return exclusive(this.store, async () => {
      const current = await this.store.get(key)
      await this.store.set(key, current + 1)
    })
  }
}

module.exports = { JobQueue }
