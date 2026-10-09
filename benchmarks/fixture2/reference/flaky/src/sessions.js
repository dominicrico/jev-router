const DEFAULTS = { ttlMs: 1000, sliding: false }

// In-memory sessions. A session expires when now - createdAt >= ttlMs (now is Date.now()).
// With `sliding`, every successful get() counts as a new start of the session.
function createStore(options = {}) {
  const config = { ...DEFAULTS, ...options }
  const sessions = new Map()
  let seq = 0

  const newId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  return {
    config,
    create(user) {
      const id = newId()
      sessions.set(id, { id, user, createdAt: Date.now() })
      return id
    },
    get(id) {
      const s = sessions.get(id)
      if (!s) return undefined
      if (Date.now() - s.createdAt >= config.ttlMs) { sessions.delete(id); return undefined }
      if (config.sliding) s.createdAt = Date.now()
      return s
    },
    destroy(id) { return sessions.delete(id) },
    get size() { return sessions.size },
  }
}

module.exports = { createStore }
