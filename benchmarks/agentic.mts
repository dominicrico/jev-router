// Multi-step, tool-using tasks on a small fixture repo, run headless under four strategies:
//   opus / sonnet: no plugin, that model at its default effort
//   prompt: jev-router with one Jev call per prompt (routeSteps and routeSubagents off)
//   full:   jev-router with every step and every subagent routed (the defaults)
// Records real tokens, cost and turns, and checks whether the task was actually done.
// FIXTURE=fixture2 (or --fixture fixture2) switches to the harder fixture2: four tasks graded by hidden tests,
// one more strategy ('!full'), results in results/agentic2.json. Stops launching runs once the total cost passes
// BUDGET_USD (default 25). ONLY=name1,name2 (exact strategy names) plans just those strategies; other results stay untouched.
// usage: TYPESAFE_API_KEY=... [FIXTURE=fixture2] npx tsx --tsconfig benchmarks/tsconfig.json benchmarks/agentic.mts [runs]
import { execFile, execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { copyVisible } from './fixture2/grade.mjs'
import { TASKS2 } from './fixture2/tasks.mts'

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2), fi = argv.indexOf('--fixture')
const F2 = (fi >= 0 ? argv[fi + 1] : process.env.FIXTURE) === 'fixture2'
if (fi >= 0) argv.splice(fi, 2)
const fixture = join(here, F2 ? 'fixture2' : 'fixture'), OUT = join(here, F2 ? 'results/agentic2.json' : 'results/agentic.json')
const WORK = F2 ? '/tmp/jevbench/agentic2' : '/tmp/jevbench/agentic', PLUGINS = '/tmp/jevbench/plugins'
const RUNS = Number(argv[0] ?? 1)
const BUDGET = Number(process.env.BUDGET_USD ?? 25)

const node = (dir: string, code: string) => { try { return execFileSync('node', ['-e', code], { cwd: dir, encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] }).trim() } catch { return 'ERR' } }
const testsPass = (dir: string) => { try { execFileSync('node', ['--test'], { cwd: dir, stdio: 'ignore', timeout: 30000 }); return true } catch { return false } }
const passCount = (dir: string) => { try { return Number(/ℹ pass (\d+)/.exec(execFileSync('node', ['--test', '--test-reporter=spec'], { cwd: dir, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'ignore'] }))?.[1]) } catch (e: any) { return Number(/ℹ pass (\d+)/.exec(String(e.stdout))?.[1] ?? 0) } }
const grep = (dir: string, re: string, ...files: string[]) => node(dir, `const fs=require('fs');console.log(${JSON.stringify(files)}.map(f=>fs.readFileSync(f,'utf8')).join('\\n').match(new RegExp(${JSON.stringify(re)},'g'))?.length||0)`)

const TASKS1 = [
  { id: 'rename', tier: 'easy', prompt: 'Rename the function `calcTotal` to `computeTotal` everywhere in this repo (source and tests) and make sure `node --test` passes.',
    check: (d: string) => grep(d, 'calcTotal', 'src/cart.js', 'src/report.js', 'test/cart.test.js') === '0' && testsPass(d) },
  { id: 'bugfix', tier: 'easy', prompt: '`node --test` has a failing test. Find the cause and fix the source code, not the test.',
    check: (d: string) => testsPass(d) && execFileSync('git', ['diff', '--no-index', '--quiet', join(fixture, 'test'), join(d, 'test')], { stdio: 'ignore' }) === null },
  { id: 'feature', tier: 'standard', prompt: 'Add `applyCoupon(items, code)` to src/cart.js and export it. It returns the same shape as calcTotal. Code SAVE10 takes 10% off the subtotal (rounded), code FREESHIP makes shipping 0, any other code throws. Add tests for it and keep the existing tests passing.',
    check: (d: string) => node(d, `const {applyCoupon:a,calcTotal:c}=require('./src/cart');const i=[{sku:'apple',qty:2}];let ok=a(i,'SAVE10').subtotal===216&&a(i,'FREESHIP').shipping===0;try{a(i,'NOPE');ok=false}catch{};console.log(ok)`) === 'true' },
  { id: 'subagent', tier: 'standard', prompt: 'Spawn an Explore subagent to survey the repo and find every module that imports src/pricing.js and every place money is rounded. Then write a short answer.md with what it found.',
    check: (d: string) => existsSync(join(d, 'answer.md')) && ['cart.js', 'pricing.js', 'tax.js'].every(f => readFileSync(join(d, 'answer.md'), 'utf8').includes(f)) },
  { id: 'refactor', tier: 'standard', prompt: 'Money formatting is duplicated. Refactor so it lives only in src/format.js and every other module uses it. Keep the tests passing.',
    check: (d: string) => grep(d, 'toFixed\\(2\\)', 'src/cart.js', 'src/report.js', 'src/pricing.js', 'src/tax.js') === '0' && passCount(d) >= 4 }, // the fixture ships with one failing test
  { id: 'hard', tier: 'hard', prompt: 'A customer reports the cart total is too low when the same SKU appears in the cart twice, for example two lines of 6 apples. Find the root cause, explain it in NOTES.md, and fix it. Add a regression test.',
    check: (d: string) => existsSync(join(d, 'NOTES.md')) && node(d, `const {calcTotal:c}=require('./src/cart');const {lineTotal:l}=require('./src/pricing');console.log(c([{sku:'apple',qty:6},{sku:'apple',qty:6}]).subtotal===l('apple',12))`) === 'true' },
]
const TASKS: { id: string; tier: string; prompt: string; check: (d: string) => boolean }[] = F2 ? TASKS2 : TASKS1
const STRATS: Record<string, string[]> = {
  'no plugin: always opus': ['--model', 'claude-opus-5-5'],
  'no plugin: always sonnet': ['--model', 'claude-sonnet-5-5'],
  'jev-router: per prompt': ['--plugin-dir', `${PLUGINS}/prompt`],
  'jev-router: every step + subagents': ['--plugin-dir', `${PLUGINS}/full`],
  ...(F2 ? { 'jev-router: !full': ['--plugin-dir', `${PLUGINS}/full`] } : {}), // the default plugin, effort cap lifted by a "!full " prefix
  ...(F2 ? { 'jev-router: ceiling sonnet': ['--plugin-dir', `${PLUGINS}/ceiling`] } : {}), // every step and subagent routed, never above sonnet unless Jev is 90% sure
  'jev-router: lean (sonnet ceiling, cap medium)': ['--plugin-dir', `${PLUGINS}/lean`], // like ceiling, plus the effort cap lowered to medium
}
const PREFIX: Record<string, string> = { 'jev-router: !full': '!full ' }

// Strategy names may contain commas (the lean one does), so match known names first and only then split on commas.
const parseOnly = (v: string) => { const out: string[] = []; for (let rest = v.trim(); rest; ) { const hit = Object.keys(STRATS).filter(n => rest === n || rest.startsWith(n + ',')).sort((a, b) => b.length - a.length)[0] ?? rest.split(',')[0]!; out.push(hit.trim()); rest = rest.slice(hit.length).replace(/^\s*,\s*/, '') } return out.filter(Boolean) }
const ONLY = process.env.ONLY ? parseOnly(process.env.ONLY) : undefined
if (ONLY) { const bad = ONLY.filter(n => !(n in STRATS)); if (bad.length) throw new Error(`ONLY: unknown strategy ${bad.map(b => JSON.stringify(b)).join(', ')}; known: ${Object.keys(STRATS).join(' | ')}`) }

// Copies of the mod, differing only in the defaults of the new options (the ceiling and lean copies route everything, like full).
for (const [name, on, ceiling, cap] of [['prompt', false, 'none', undefined], ['full', true, 'none', undefined], ['ceiling', true, 'sonnet', undefined], ['lean', true, 'sonnet', 'medium']] as const) {
  const dst = `${PLUGINS}/${name}`
  rmSync(dst, { recursive: true, force: true }); mkdirSync(dst, { recursive: true })
  for (const p of ['hooks', 'types', '.claude-plugin/plugin.json']) { mkdirSync(dirname(join(dst, p)), { recursive: true }); cpSync(join(here, '..', p), join(dst, p), { recursive: true }) }
  const pj = JSON.parse(readFileSync(join(dst, '.claude-plugin/plugin.json'), 'utf8'))
  pj.userConfig.routeSteps.default = on; pj.userConfig.routeSubagents.default = on; pj.userConfig.ceiling.default = ceiling; pj.userConfig.effortCap.default = cap ?? 'high'
  if (cap) pj.userConfig.effortCap.default = cap
  writeFileSync(join(dst, '.claude-plugin/plugin.json'), JSON.stringify(pj, null, 2))
  rmSync(join(dst, 'hooks/register.test.ts'), { force: true })
}

const done: any[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []
const jobs = TASKS.flatMap(t => Object.keys(STRATS).filter(s => !ONLY || ONLY.includes(s)).flatMap(s => Array.from({ length: RUNS }, (_, r) => ({ t, s, r })))).filter(j => !done.some(d => d.task === j.t.id && d.strategy === j.s && d.run === j.r))

if (ONLY) console.log(`ONLY: ${ONLY.join(', ')} -> ${jobs.length} runs planned`)

async function one({ t, s, r }: any) {
  const dir = `${WORK}/${t.id}-${Object.keys(STRATS).indexOf(s)}-${r}`
  rmSync(dir, { recursive: true, force: true })
  if (F2) copyVisible(dir, t.id); else cpSync(fixture, dir, { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: dir })
  const args = ['-p', (PREFIX[s] ?? '') + t.prompt, '--setting-sources', '', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--output-format', 'json',
    '--max-budget-usd', '2', '--max-turns', '40', '--allowedTools', 'Bash,Edit,Write,Read,Glob,Grep,Agent', ...STRATS[s]!]
  let rec: any
  try {
    const { stdout } = await run('claude', args, { cwd: dir, maxBuffer: 64e6, timeout: 900_000 })
    const d = JSON.parse(stdout), mu = Object.entries<any>(d.modelUsage ?? {})
    rec = { task: t.id, tier: t.tier, strategy: s, run: r, ok: !d.is_error && t.check(dir), usd: d.total_cost_usd, turns: d.num_turns, ms: d.duration_ms,
      output: mu.reduce((a, [, v]) => a + v.outputTokens, 0), input: mu.reduce((a, [, v]) => a + v.inputTokens + v.cacheReadInputTokens + v.cacheCreationInputTokens, 0),
      models: Object.fromEntries(mu.map(([k, v]) => [k, { out: v.outputTokens, usd: +v.costUSD.toFixed(4) }])), error: d.is_error ? String(d.result).slice(0, 120) : undefined }
  } catch (e) {
    rec = { task: t.id, tier: t.tier, strategy: s, run: r, ok: false, error: String(e).slice(0, 160) }
  }
  done.push(rec); writeFileSync(OUT, JSON.stringify(done, null, 1))
  total += rec.usd ?? 0
  console.log(`${done.length} ${t.id} | ${s} | ${rec.ok ? 'OK ' : 'FAIL'} $${rec.usd?.toFixed(3)} ${rec.turns}t ${Object.keys(rec.models ?? {}).map(m => m.replace('claude-', '')).join(',')} | total $${total.toFixed(2)} of $${BUDGET}`)
}
let total = done.reduce((a, d) => a + (d.usd ?? 0), 0) // includes runs kept from earlier invocations
const queue = [...jobs]
await Promise.all(Array.from({ length: 3 }, async () => { for (let j; total <= BUDGET && (j = queue.shift()); ) await one(j) }))
if (queue.length) console.log(`budget reached ($${total.toFixed(2)} > $${BUDGET}): ${queue.length} runs not launched, rerun to continue`)
console.log('errors:', done.filter(d => d.error).length)
