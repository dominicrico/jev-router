# ops-kit

Small operational building blocks. No dependencies; `npm test` runs the tests.

- `src/queue.js`: an async job queue with a concurrency limit, retries and stats.
  Stats are kept in a store. A store is any object with async `get(key)` (returns a number, 0 when unset)
  and `set(key, value)`. One store may be shared by several queues. Stores only promise `get` and `set`.
- `src/intervals.js`: interval arithmetic.
- `src/orders.js`, `src/checkout.js`, `src/admin.js`: a tiny order flow over a stock table (`src/db.js`).
- `src/sessions.js`: an in-memory session store. A session expires when `now - createdAt >= ttlMs`,
  `now` being `Date.now()`.
