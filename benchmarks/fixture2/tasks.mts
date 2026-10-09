// The four tasks of fixture2. Each is graded by hidden/<id>.test.js, copied in only after the run.
import { grade } from './grade.mjs'

export const TASKS2 = [
  { id: 'queue', tier: 'hard',
    prompt: "Under concurrency the job queue's stats come out wrong: after a few dozen jobs, `stats().completed` is lower than the number of jobs that succeeded. Find the root cause and fix it in src/. Keep the public API (`new JobQueue({ concurrency, retries, store })`, `push`, `drain`, `stats`) and the concurrency limit working. Stores only promise get/set (see the README) and one store may be shared by several queues.",
  },
  { id: 'intervals', tier: 'hard',
    prompt: 'Implement `mergeIntervals` in src/intervals.js; the contract is in the JSDoc above it. It must be correct for every case that contract describes. Add tests for the edge cases to test/intervals.test.js.',
  },
  { id: 'inventory', tier: 'hard',
    prompt: 'Refactor so that all stock and reservation logic lives in a new module src/inventory.js that exports `OutOfStock`, `reserve(lines)`, `release(lines)`, `commit(lines)`, `restock(sku, qty)`, `writeOff(sku, qty)`, `available(sku)` and `snapshot()` (the rows `report()` returns). After the refactor src/orders.js, src/checkout.js and src/admin.js must not touch `db.stock` or `db.reserved` (nor alias them); only inventory.js does. `orders.OutOfStock` stays exported and is the class inventory throws. The observable behaviour of every exported function of orders.js, checkout.js and admin.js must not change, and 0 <= reserved <= stock must hold for every sku after every operation. Leave src/db.js alone and keep the tests passing.',
  },
  { id: 'flaky', tier: 'hard',
    prompt: '`npm test` is flaky: test/sessions.test.js fails now and then and passes on a re-run. Find the root causes (there may be more than one, in the test and in the source) and fix them properly: no retries, no longer sleeps, no skipped or deleted tests. Keep `Date.now()` as the time source of src/sessions.js and do not change its public API or its documented behaviour (see the README).',
  },
].map(t => ({ ...t, check: (dir: string) => grade(dir, t.id).ok }))
