// Multi-step, tool-using tasks on a small fixture repo, run headless under four strategies:
//   opus / sonnet: no plugin, that model at its default effort
//   prompt: jev-router with one Jev call per prompt (routeSteps and routeSubagents off)
//   full:   jev-router with every step and every subagent routed (the defaults)
// Records real tokens, cost and turns, and checks whether the task was actually done.
// usage: TYPESAFE_API_KEY=... npx tsx --tsconfig benchmarks/tsconfig.json benchmarks/agentic.mts [runs]
import { execFile, execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, 'fixture'), OUT = join(here, 'results/agentic.json')
const WORK = '/tmp/jevbench/agentic', PLUGINS = '/tmp/jevbench/plugins'
const RUNS = Number(process.argv[2] ?? 1)

const node = (dir: string, code: string) => { try { return execFileSync('node', ['-e', code], { cwd: dir, encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] }).trim() } catch { return 'ERR' } }
const testsPass = (dir: string) => { try { execFileSync('node', ['--test'], { cwd: dir, stdio: 'ignore', timeout: 30000 }); return true } catch { return false } }
const passCount = (dir: string) => { try { return Number(/ℹ pass (\d+)/.exec(execFileSync('node', ['--test', '--test-reporter=spec'], { cwd: dir, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'ignore'] }))?.[1]) } catch (e: any) { return Number(/ℹ pass (\d+)/.exec(String(e.stdout))?.[1] ?? 0) } }
const grep = (dir: string, re: string, ...files: string[]) => node(dir, `const fs=require('fs');console.log(${JSON.stringify(files)}.map(f=>fs.readFileSync(f,'utf8')).join('\\n').match(new RegExp(${JSON.stringify(re)},'g'))?.length||0)`)

const TASKS = [
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
const STRATS: Record<string, string[]> = {
  'no plugin: always opus': ['--model', 'claude-opus-5-5'],
  'no plugin: always sonnet': ['--model', 'claude-sonnet-5-5'],
  'jev-router: per prompt': ['--plugin-dir', `${PLUGINS}/prompt`],
  'jev-router: every step + subagents': ['--plugin-dir', `${PLUGINS}/full`],
}

// Two copies of the mod, differing only in the defaults of the two new options.
for (const [name, on] of [['prompt', false], ['full', true]] as const) {
  const dst = `${PLUGINS}/${name}`
  rmSync(dst, { recursive: true, force: true }); mkdirSync(dst, { recursive: true })
  for (const p of ['hooks', 'types', '.claude-plugin/plugin.json']) { mkdirSync(dirname(join(dst, p)), { recursive: true }); cpSync(join(here, '..', p), join(dst, p), { recursive: true }) }
  const pj = JSON.parse(readFileSync(join(dst, '.claude-plugin/plugin.json'), 'utf8'))
  pj.userConfig.routeSteps.default = on; pj.userConfig.routeSubagents.default = on
  writeFileSync(join(dst, '.claude-plugin/plugin.json'), JSON.stringify(pj, null, 2))
  rmSync(join(dst, 'hooks/register.test.ts'), { force: true })
}

const done: any[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []
const jobs = TASKS.flatMap(t => Object.keys(STRATS).flatMap(s => Array.from({ length: RUNS }, (_, r) => ({ t, s, r })))).filter(j => !done.some(d => d.task === j.t.id && d.strategy === j.s && d.run === j.r))

async function one({ t, s, r }: any) {
  const dir = `${WORK}/${t.id}-${Object.keys(STRATS).indexOf(s)}-${r}`
  rmSync(dir, { recursive: true, force: true }); cpSync(fixture, dir, { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: dir })
  const args = ['-p', t.prompt, '--setting-sources', '', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--output-format', 'json',
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
  console.log(`${done.length} ${t.id} | ${s} | ${rec.ok ? 'OK ' : 'FAIL'} $${rec.usd?.toFixed(3)} ${rec.turns}t ${Object.keys(rec.models ?? {}).map(m => m.replace('claude-', '')).join(',')}`)
}
const queue = [...jobs]
await Promise.all(Array.from({ length: 3 }, async () => { for (let j; (j = queue.shift()); ) await one(j) }))
console.log('errors:', done.filter(d => d.error).length)
