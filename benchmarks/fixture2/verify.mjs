// Free check of the fixture: every hidden test must FAIL on the untouched fixture and PASS (together with the
// visible tests) once the reference solution is applied. usage: node benchmarks/fixture2/verify.mjs
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TASK_IDS, copyVisible, grade } from './grade.mjs'
import { unsealed } from './seal.mjs'

let bad = 0
const line = (task, what, ok, extra = '') => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${task.padEnd(10)} ${what}${extra ? '  ' + extra : ''}`) }

for (const task of TASK_IDS) {
  const dir = mkdtempSync(join(tmpdir(), `fixture2-${task}-`))
  copyVisible(dir, task)
  // Three runs before: a hidden test that only fails sometimes is not a grader.
  const before = [1, 2, 3].map(() => grade(dir, task))
  line(task, 'untouched fixture: hidden test fails (3/3 runs)', before.every(r => !r.hidden), `visible tests ${before[0].visible ? 'pass' : 'fail'}`)
  cpSync(join(unsealed(), 'reference', task), dir, { recursive: true })
  const after = [1, 2, 3].map(() => grade(dir, task))
  line(task, 'reference applied: hidden + visible tests pass (3/3 runs)', after.every(r => r.ok), after.every(r => r.ok) ? '' : after.find(r => !r.ok).detail)
  rmSync(dir, { recursive: true, force: true })
}
console.log(bad ? `\n${bad} check(s) failed` : '\nall checks passed')
process.exit(bad ? 1 : 0)
