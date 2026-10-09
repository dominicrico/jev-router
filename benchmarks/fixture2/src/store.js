const tick = () => new Promise(resolve => setImmediate(resolve))

// Pretends to be a remote store: every call yields to the event loop.
class MemoryStore {
  constructor() { this.map = new Map() }
  async get(key) { await tick(); return this.map.get(key) ?? 0 }
  async set(key, value) { await tick(); this.map.set(key, value) }
}

module.exports = { MemoryStore }
