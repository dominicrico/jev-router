// Replays 8 mixed tasks as ONE multi-turn session per strategy, so the prompt cache really warms and a model
// switch really costs a cache re-write. Turn 1: `claude -p --session-id <uuid>`, turns 2-8: `--resume <uuid>`.
// Tools are disabled and the cwd is empty, like tokens.mts: only the model and the routing differ.
// Strategies: always opus, always sonnet, jev-router with stickiness auto (the default), jev-router with stickiness off.
// 3 sessions per strategy; session r uses the same task order for every strategy (seeded shuffle).
// Records, per turn, modelUsage per model, cost and cache tokens; per session the total cost and the model switches.
// usage: TYPESAFE_API_KEY=... [MODE=efficient|balanced|cheap] [BUDGET_USD=25] npx tsx --tsconfig benchmarks/tsconfig.json benchmarks/session.mts [sessions] [--dry]
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const OUT = join(here, 'results/session.json')
const WORK = '/tmp/jevbench/session', PLUGINS = '/tmp/jevbench/plugins'
const argv = process.argv.slice(2)
const DRY = argv.includes('--dry')
const SESSIONS = Number(argv.find(a => /^\d+$/.test(a)) ?? 3)
const BUDGET = Number(process.env.BUDGET_USD ?? 25)
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

const COMMON = ['--setting-sources', '', '--strict-mcp-config', '--disable-slash-commands', '--tools', '', '--output-format', 'json', '--max-budget-usd', '1.5', '--append-system-prompt', SYSTEM]
const turnArgs = (s: string, text: string, id: string, first: boolean) => ['-p', text, first ? '--session-id' : '--resume', id, ...COMMON, ...STRATS[s]!]

const plan = Array.from({ length: SESSIONS }, (_, r) => Object.keys(STRATS).map(s => ({ strategy: s, session: r, tasks: order(r) }))).flat()

if (DRY) {
  console.log(`${plan.length} sessions x ${TASKS.length} turns = ${plan.length * TASKS.length} claude calls (cap $1.5 per call, stops at $${BUDGET} total)`)
  console.log(`tasks: ${TASKS.map(t => `${t.id}(${t.tier})`).join(' ')}`)
  for (const p of plan) console.log(`session ${p.session} | ${p.strategy.padEnd(28)} | ${p.tasks.map(t => t.id).join(' ')}`)
  const ex = plan[2]!
  const show = (first: boolean) => 'claude ' + turnArgs(ex.strategy, ex.tasks[0]!.id + ' <task text>', '<uuid>', first).map((a, i) => (i === 1 ? '<task text>' : a === SYSTEM ? '<system>' : a)).map(a => (a === '' ? "''" : a)).join(' ')
  console.log(`\nturn 1:   ${show(true)}\nturns 2+: ${show(false)}\ncwd: ${WORK}/<strategy index>-<session>`)
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

// The model that carried a turn: the one with the largest cost in modelUsage.
const mainModel = (models: Record<string, any>) => Object.entries(models).sort((a, b) => b[1].usd - a[1].usd)[0]?.[0]
const switches = (turns: any[]) => turns.slice(1).filter((t, i) => t.model && turns[i].model && t.model !== turns[i].model).length

async function session({ strategy, session: r, tasks }: (typeof plan)[number]) {
  const dir = `${WORK}/${Object.keys(STRATS).indexOf(strategy)}-${r}`
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  const rec: any = { strategy, session: r, sessionId: randomUUID(), order: tasks.map(t => t.id), turns: [], totalUsd: 0, switches: 0, complete: false }
  live.push(rec)
  for (const [i, t] of tasks.entries()) {
    if (total > BUDGET) { rec.error = `budget $${BUDGET} reached`; break }
    try {
      const { stdout } = await run('claude', turnArgs(strategy, t.text, rec.sessionId, i === 0), { cwd: dir, maxBuffer: 64e6, timeout: 600_000 })
      const d = JSON.parse(stdout)
      const models = Object.fromEntries(Object.entries<any>(d.modelUsage ?? {}).map(([k, v]) => [k, { in: v.inputTokens, out: v.outputTokens, cacheRead: v.cacheReadInputTokens, cacheWrite: v.cacheCreationInputTokens, usd: +v.costUSD.toFixed(5) }]))
      const sum = (f: string) => Object.values<any>(models).reduce((a, m) => a + m[f], 0)
      const turn = { i, task: t.id, tier: t.tier, model: mainModel(models), usd: d.total_cost_usd, cacheRead: sum('cacheRead'), cacheWrite: sum('cacheWrite'), out: sum('out'), ms: d.duration_ms, models, error: d.is_error ? String(d.result).slice(0, 120) : undefined }
      rec.turns.push(turn); rec.totalUsd += d.total_cost_usd ?? 0; total += d.total_cost_usd ?? 0
      console.log(`${strategy} #${r} turn ${i + 1}/${tasks.length} ${t.id} ${turn.model?.replace('claude-', '')} $${turn.usd?.toFixed(4)} cw ${turn.cacheWrite} cr ${turn.cacheRead} | total $${total.toFixed(2)} of $${BUDGET}`)
      if (d.is_error) { rec.error = turn.error; break }
    } catch (e) { rec.error = String(e).slice(0, 160); break }
    save(live)
  }
  rec.switches = switches(rec.turns)
  rec.complete = rec.turns.length === tasks.length && !rec.error
  if (rec.complete) { done.push(rec); live.splice(live.indexOf(rec), 1) }
  save(live)
}

const queue = [...jobs]
await Promise.all(Array.from({ length: 4 }, async () => { for (let j; total <= BUDGET && (j = queue.shift()); ) await session(j) }))
if (queue.length) console.log(`budget reached ($${total.toFixed(2)} > $${BUDGET}): ${queue.length} sessions not started, rerun to continue`)
console.log('incomplete sessions:', live.length)
