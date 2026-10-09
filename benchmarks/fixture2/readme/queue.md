`src/queue.js`: an async job queue with a concurrency limit, retries and stats.
Stats are kept in a store. A store is any object with async `get(key)` (returns a number, 0 when unset)
and `set(key, value)`. Stores only promise those two methods. One store may be shared by several queues.
