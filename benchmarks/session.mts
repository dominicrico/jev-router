// Replays 8 mixed tasks as ONE multi-turn session per strategy, so the prompt cache really warms and a model
// switch really costs a cache re-write. Each session is ONE long-lived `claude -p --input-format stream-json
// --output-format stream-json` process: a user message is written to stdin, the script waits for that turn's
// `result` line, then writes the next one. (One process per turn with --resume loses the mod's state, e.g. the
// prompt-cache atom the cache guard reads, and would measure nothing.)
// In stream-json mode `total_cost_usd` and `modelUsage` in each result are CUMULATIVE for the process, so per-turn
// figures are deltas against the previous result.
// Tools are disabled and the cwd is empty, like tokens.mts: only the model and the routing differ.
// Strategies: always opus, always sonnet, jev-router with stickiness auto (the default), jev-router with stickiness off.
// 3 sessions per strategy; session r uses the same task order for every strategy (seeded shuffle).
// Records, per turn, per-model token and cost deltas and the dominant model; per session the total cost and the model switches.
// usage: TYPESAFE_API_KEY=... [MODE=efficient|balanced|cheap] [BUDGET_USD=15] npx tsx --tsconfig benchmarks/tsconfig.json benchmarks/session.mts [sessions] [--dry]
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// CONTEXT=repo: the first turn also carries ~20k tokens of source, so contexts are long enough for the cache guard to matter (results go to session-long.json).
const LONG = process.env.CONTEXT === 'repo'
const OUT = join(here, LONG ? 'results/session-long.json' : 'results/session.json')
const WORK = '/tmp/jevbench/session', PLUGINS = '/tmp/jevbench/plugins'
const argv = process.argv.slice(2)
const DRY = argv.includes('--dry')
const SESSIONS = Number(argv.find(a => /^\d+$/.test(a)) ?? 3)
const BUDGET = Number(process.env.BUDGET_USD ?? 15)
const MODE = process.env.MODE // optional: override the plugin's routing mode default

const cases: { id: string; tier: string; text: string }[] = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8'))
// 3 trivial, 3 standard, 2 hard.
const PICK = ['t02', 't05', 't09', 's01', 's03', 's06', 'h02', 'h08']
const TASKS = PICK.map(id => cases.find(c => c.id === id) ?? (() => { throw new Error(`no case ${id}`) })())

const SYSTEM = 'You are answering a coding task in an empty, read-only sandbox. Do not call tools. Reply in text: give the concrete changes or the plan you would make, as a senior engineer would. Be as brief as the task allows.'
const STRATS: Record<string, string[]> = {
  'no plugin: always opus': ['--model', 'claude-opus-5-5'],
  'no plugin: always sonnet': ['--model', 'claude-sonnet-5-5'],
  'jev-router: stickiness auto': ['--plugin-dir', `${PLUGINS}/sticky-auto`],
  'jev-router: stickiness off': ['--plugin-dir', `${PLUGINS}/sticky-off`],
}

// Seeded shuffle (mulberry32), so a session has the same order under every strategy.
function order(session: number) {
  let a = 0x9e3779b9 + session * 7919
  const rand = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const x = [...TASKS]
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [x[i], x[j]] = [x[j]!, x[i]!] }
  return x
}

const SESSION_CAP_USD = 6 // --max-budget-usd now applies to the whole process, i.e. one session
const COMMON = ['--setting-sources', '', '--strict-mcp-config', '--disable-slash-commands', '--tools', '', '--max-budget-usd', String(SESSION_CAP_USD), '--append-system-prompt', SYSTEM]
const streamArgs = (s: string) => ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', ...COMMON, ...STRATS[s]!]
const CONTEXT = LONG ? ['hooks/register.tsx', 'hooks/register.test.ts', 'README.md'].map(f => `=== ${f} ===\n${readFileSync(join(here, '..', f), 'utf8')}`).join('\n\n').slice(0, 80_000) : ''
const userLine = (text: string) => JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n'

const plan = Array.from({ length: SESSIONS }, (_, r) => Object.keys(STRATS).map(s => ({ strategy: s, session: r, tasks: order(r) }))).flat()

if (DRY) {
  console.log(`${plan.length} sessions x ${TASKS.length} turns = ${plan.length * TASKS.length} turns, ${plan.length} claude processes (one per session, cap $${SESSION_CAP_USD} per process, stops launching at $${BUDGET} total)`)
  console.log(`tasks: ${TASKS.map(t => `${t.id}(${t.tier})`).join(' ')}`)
  for (const p of plan) console.log(`session ${p.session} | ${p.strategy.padEnd(28)} | ${p.tasks.map(t => t.id).join(' ')}`)
  const ex = plan[2]!
  const cmd = 'claude ' + streamArgs(ex.strategy).map(a => (a === SYSTEM ? '<system>' : a === '' ? "''" : a)).join(' ')
  console.log(`\nprocess: ${cmd}\nstdin, one line per turn, written only after the previous turn's result line: ${userLine('<task text>').trim()}\nstdout: one {"type":"result",...} line per turn (cumulative total_cost_usd and modelUsage; the script records deltas)\ncwd: ${WORK}/<strategy index>-<session>`)
  process.exit(0)
}

// Two copies of the mod, differing only in the default of `stickiness` (and the optional mode).
for (const [name, stick] of [['sticky-auto', 'auto'], ['sticky-off', 'off']] as const) {
  const dst = `${PLUGINS}/${name}`
  rmSync(dst, { recursive: true, force: true }); mkdirSync(dst, { recursive: true })
  for (const p of ['hooks', 'types', '.claude-plugin/plugin.json']) { mkdirSync(dirname(join(dst, p)), { recursive: true }); cpSync(join(here, '..', p), join(dst, p), { recursive: true }) }
  const pj = JSON.parse(readFileSync(join(dst, '.claude-plugin/plugin.json'), 'utf8'))
  pj.userConfig.stickiness.default = stick
  if (MODE) pj.userConfig.mode.default = MODE
  writeFileSync(join(dst, '.claude-plugin/plugin.json'), JSON.stringify(pj, null, 2))
  rmSync(join(dst, 'hooks/register.test.ts'), { force: true })
}

// Sessions kept from an earlier invocation count only when all their turns finished; the rest start over.
const done: any[] = (existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []).filter((s: any) => s.complete)
const jobs = plan.filter(p => !done.some(d => d.strategy === p.strategy && d.session === p.session))
let total = done.reduce((a, s) => a + s.totalUsd, 0)
const save = (live: any[]) => writeFileSync(OUT, JSON.stringify([...done, ...live], null, 1))
const live: any[] = []

// The model that carried a turn: the one with the largest cost delta.
const mainModel = (models: Record<string, any>) => Object.entries(models).sort((a, b) => b[1].usd - a[1].usd)[0]?.[0]
const switches = (turns: any[]) => turns.slice(1).filter((t, i) => t.model && turns[i].model && t.model !== turns[i].model).length
const TURN_TIMEOUT_MS = 600_000

// One claude process per session; results are read one per turn from stdout.
function open(strategy: string, cwd: string) {
  const child = spawn('claude', streamArgs(strategy), { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
  const results: any[] = []
  let wake: (() => void) | undefined
  let closed = false, stderr = ''
  const notify = () => { const w = wake; wake = undefined; w?.() }
  child.stderr.on('data', d => { stderr = (stderr + d).slice(-500) })
  child.stdin.on('error', () => {}) // EPIPE when the process died; surfaced through `closed`
  child.on('close', () => { closed = true; notify() })
  child.on('error', e => { stderr = String(e); closed = true; notify() })
  createInterface({ input: child.stdout }).on('line', line => {
    let d: any
    try { d = JSON.parse(line) } catch { return }
    if (d?.type === 'result') { results.push(d); notify() }
  })
  return {
    send: (text: string) => child.stdin.write(userLine(text)),
    // Resolves with the next result line, or rejects if the process ends or the turn times out.
    async next(): Promise<any> {
      const deadline = Date.now() + TURN_TIMEOUT_MS
      while (!results.length) {
        if (closed) throw new Error(`claude exited without a result${stderr ? `: ${stderr.trim()}` : ''}`)
        const left = deadline - Date.now()
        if (left <= 0) throw new Error('turn timed out')
        await new Promise<void>(res => { const t = setTimeout(res, left); wake = () => { clearTimeout(t); res() } })
      }
      return results.shift()
    },
    close() { try { child.stdin.end() } catch {} ; setTimeout(() => child.kill(), 3000).unref() },
  }
}

const delta = (cur: Record<string, any> = {}, prev: Record<string, any> = {}) => Object.fromEntries(Object.entries<any>(cur).map(([m, v]) => {
  const p = prev[m] ?? {}
  return [m, {
    in: (v.inputTokens ?? 0) - (p.inputTokens ?? 0),
    out: (v.outputTokens ?? 0) - (p.outputTokens ?? 0),
    cacheRead: (v.cacheReadInputTokens ?? 0) - (p.cacheReadInputTokens ?? 0),
    cacheWrite: (v.cacheCreationInputTokens ?? 0) - (p.cacheCreationInputTokens ?? 0),
    usd: +((v.costUSD ?? 0) - (p.costUSD ?? 0)).toFixed(5),
  }]
}))

async function session({ strategy, session: r, tasks }: (typeof plan)[number]) {
  const dir = `${WORK}/${Object.keys(STRATS).indexOf(strategy)}-${r}`
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  const rec: any = { strategy, session: r, sessionId: randomUUID(), order: tasks.map(t => t.id), turns: [], totalUsd: 0, switches: 0, complete: false }
  live.push(rec)
  const proc = open(strategy, dir)
  let prevUsd = 0, prevModels: Record<string, any> = {}
  try {
    for (const [i, t] of tasks.entries()) {
      if (total > BUDGET) { rec.error = `budget $${BUDGET} reached`; break }
      const t0 = Date.now()
      proc.send(LONG && rec.turns.length === 0 ? `${CONTEXT}\n\nThe code above is the project all of the following tasks are about. First task:\n${t.text}` : t.text)
      const d = await proc.next()
      const cum = d.total_cost_usd ?? prevUsd
      const models = delta(d.modelUsage, prevModels)
      const sum = (f: string) => Object.values<any>(models).reduce((a, m) => a + m[f], 0)
      const turn = { i, task: t.id, tier: t.tier, model: mainModel(models), usd: +(cum - prevUsd).toFixed(5), cacheRead: sum('cacheRead'), cacheWrite: sum('cacheWrite'), out: sum('out'), ms: d.duration_ms ?? Date.now() - t0, models, error: d.is_error ? String(d.result).slice(0, 120) : undefined }
      prevUsd = cum; prevModels = d.modelUsage ?? prevModels
      rec.turns.push(turn); rec.totalUsd = cum; total += turn.usd
      console.log(`${strategy} #${r} turn ${i + 1}/${tasks.length} ${t.id} ${turn.model?.replace('claude-', '')} $${turn.usd.toFixed(4)} cw ${turn.cacheWrite} cr ${turn.cacheRead} | total $${total.toFixed(2)} of $${BUDGET}`)
      save(live)
      if (d.is_error) { rec.error = turn.error ?? String(d.subtype); break }
    }
  } catch (e) { rec.error = String(e).slice(0, 200) }
  finally { proc.close() }
  rec.switches = switches(rec.turns)
  rec.complete = rec.turns.length === tasks.length && !rec.error
  if (rec.complete) { done.push(rec); live.splice(live.indexOf(rec), 1) }
  save(live)
  console.log(`session done: ${strategy} #${r} ${rec.complete ? 'complete' : `INCOMPLETE (${rec.error})`} $${rec.totalUsd.toFixed(4)} | running total $${total.toFixed(2)} of $${BUDGET}`)
}

const queue = [...jobs]
await Promise.all(Array.from({ length: 4 }, async () => { for (let j; total <= BUDGET && (j = queue.shift()); ) await session(j) }))
if (queue.length) console.log(`budget reached ($${total.toFixed(2)} > $${BUDGET}): ${queue.length} sessions not started, rerun to continue`)
console.log('incomplete sessions:', live.length, '(dropped on the next run)')
