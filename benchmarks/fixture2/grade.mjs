// Shared by verify.mjs (plain node) and agentic.mts. No network, no model calls.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unsealed } from './seal.mjs'

export const FIXTURE2 = dirname(fileURLToPath(import.meta.url))
export const TASK_IDS = ['queue', 'intervals', 'inventory', 'flaky']
// What the agent gets to see: everything but the hidden tests, the reference solutions and these scripts.
const HIDDEN = new Set(['hidden', 'reference', 'sealed.tgz', 'seal.mjs', 'readme', 'verify.mjs', 'grade.mjs', 'tasks.mts'])

// The files each task owns. An agent only gets its own task's files, so a red test of another task
// cannot distract it and `npm test` means the same thing for every strategy.
const FILES = {
  queue: ['src/queue.js', 'src/store.js', 'test/queue.test.js'],
  intervals: ['src/intervals.js', 'test/intervals.test.js'],
  inventory: ['src/db.js', 'src/orders.js', 'src/checkout.js', 'src/admin.js', 'test/orders.test.js'],
  flaky: ['src/sessions.js', 'test/sessions.test.js'],
}

export function copyVisible(dst, task) {
  cpSync(FIXTURE2, dst, { recursive: true, filter: src => !HIDDEN.has(src.slice(FIXTURE2.length + 1).split('/')[0]) })
  const own = new Set(FILES[task])
  for (const f of Object.values(FILES).flat()) if (!own.has(f)) rmSync(join(dst, f), { force: true })
  writeFileSync(join(dst, 'README.md'), `# ops-kit\n\nSmall operational building blocks. No dependencies; \`npm test\` runs the tests.\n\n${readFileSync(join(FIXTURE2, 'readme', `${task}.md`), 'utf8')}`)
}

const runTests = (cwd, files) => {
  const r = spawnSync('node', ['--test', ...files], { cwd, encoding: 'utf8', timeout: 90_000 })
  return { pass: r.status === 0, tail: `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n').filter(l => /^(✖|# (pass|fail)|ℹ (pass|fail))|not ok/.test(l)).slice(0, 12).join('\n') }
}

// Visible tests (what `npm test` sees) and the hidden test of one task, run after the agent is done.
export function grade(dir, task) {
  const visible = runTests(dir, FILES[task].filter(f => f.startsWith('test/')))
  mkdirSync(join(dir, 'hidden'), { recursive: true })
  cpSync(join(unsealed(), 'hidden', `${task}.test.js`), join(dir, 'hidden', `${task}.test.js`))
  const hidden = runTests(dir, [`hidden/${task}.test.js`])
  return { ok: hidden.pass && visible.pass, hidden: hidden.pass, visible: visible.pass, detail: hidden.tail }
}
