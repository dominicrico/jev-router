// Runs every task headless on the model and effort each strategy would use, and records real token usage and cost.
// Strategies: the two fixed-model baselines (no plugin: the model's default effort) and jev-router's three modes
// (the model and effort Jev picked in results/raw.json, run 0, applied exactly as the mod's turn.step does).
// usage: npx tsx --tsconfig benchmarks/tsconfig.json benchmarks/tokens.mts
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { capEffort } from '../hooks/register.tsx'

const run = promisify(execFile)
const IDS: Record<string, string> = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5', fable: 'claude-fable-5-1' }
const cases: any[] = JSON.parse(readFileSync(new URL('cases.json', import.meta.url), 'utf8'))
const raw: any[] = JSON.parse(readFileSync(new URL('results/raw.json', import.meta.url), 'utf8'))
const OUT = new URL('results/tokens.json', import.meta.url)
const done: Record<string, any> = existsSync(OUT) ? Object.fromEntries(JSON.parse(readFileSync(OUT, 'utf8')).map((r: any) => [r.key, r])) : {}

// Same task, same instructions, in an empty directory with no tools: only the model and effort differ.
const SYSTEM = 'You are answering a coding task in an empty, read-only sandbox. Do not call tools. Reply in text: give the concrete changes or the plan you would make, as a senior engineer would. Be as brief as the task allows.'
const cwd = '/tmp/jevbench'
mkdirSync(cwd, { recursive: true })

type Job = { key: string; id: string; model: string; effort: string | null }
const jobs = new Map<string, Job>()
const add = (id: string, model: string, effort: string | null) => jobs.set(`${id}|${model}|${effort}`, { key: `${id}|${model}|${effort}`, id, model, effort })
for (const c of cases) {
  add(c.id, 'opus', null) // without the plugin, always opus
  add(c.id, 'sonnet', null) // without the plugin, always sonnet
  for (const mode of ['efficient', 'balanced', 'cheap']) {
    const r = raw.find(x => x.id === c.id && x.mode === mode && x.run === 0)
    add(c.id, r.model, r.effort)
    add(c.id, r.model, capEffort(r.effort, 'high').effort) // the default effortCap
    add(c.id, 'opus', r.effort) // same effort, fixed opus: isolates the model from the effort
  }
}

async function one(j: Job) {
  if (done[j.key]) return
  const task = cases.find(c => c.id === j.id).text
  const args = ['-p', task, '--setting-sources', '', '--strict-mcp-config', '--disable-slash-commands', '--tools', '', '--no-session-persistence',
    '--output-format', 'json', '--max-budget-usd', '1.5', '--append-system-prompt', SYSTEM, '--model', IDS[j.model]!, ...(j.effort ? ['--effort', j.effort] : [])]
  try {
    const { stdout } = await run('claude', args, { cwd, maxBuffer: 64e6, timeout: 600_000 })
    const d = JSON.parse(stdout)
    const u = d.usage
    done[j.key] = { ...j, error: d.is_error ? String(d.result).slice(0, 120) : undefined, output: u.output_tokens, thinking: u.output_tokens_details?.thinking_tokens ?? 0,
      input: u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens, usd: d.total_cost_usd, ms: d.duration_ms }
  } catch (e) {
    done[j.key] = { ...j, error: String(e).slice(0, 160) }
  }
  writeFileSync(OUT, JSON.stringify(Object.values(done), null, 1))
  console.log(`${Object.keys(done).length}/${jobs.size} ${j.key}`, done[j.key].error ?? `${done[j.key].output} out, $${done[j.key].usd?.toFixed(4)}`)
}

const queue = [...jobs.values()]
await Promise.all(Array.from({ length: 3 }, async () => { for (let j; (j = queue.shift()); ) await one(j) }))
console.log('errors:', Object.values(done).filter((r: any) => r.error).length)
