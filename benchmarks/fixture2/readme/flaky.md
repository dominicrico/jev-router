`src/sessions.js`: an in-memory session store. A session expires when `now - createdAt >= ttlMs`,
`now` being `Date.now()`.
