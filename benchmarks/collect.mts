// Calls Jev with the exact request the mod builds, for every case x mode x run.
// usage: TYPESAFE_API_KEY=... npx tsx --tsconfig benchmarks/tsconfig.json benchmarks/collect.mts [runs]
import { readFileSync, writeFileSync } from 'node:fs'
import { composeState, jevBody, JEV_URL } from '../hooks/register.tsx'

const MODES = ['efficient', 'balanced', 'cheap'] as const
const POOL = ['haiku', 'sonnet', 'opus', 'fable']
const RUNS = Number(process.argv[2] ?? 2)
const key = process.env.TYPESAFE_API_KEY
if (!key) throw new Error('TYPESAFE_API_KEY not set')
const cases = JSON.parse(readFileSync(new URL('cases.json', import.meta.url), 'utf8'))
const cfg: any = { pool: POOL, minContextTokens: 8000, cacheTtlMs: 300_000 }

const rows: any[] = []
const jobs = cases.flatMap((c: any) => MODES.flatMap(mode => Array.from({ length: RUNS }, (_, run) => ({ c, mode, run }))))

async function one({ c, mode, run }: any) {
  const state = composeState(c.text, mode, 'claude-sonnet-5-5', '', null, 0, cfg)
  const t0 = performance.now()
  try {
    const res = await fetch(JEV_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(jevBody(POOL, state, mode)),
    })
    const ms = Math.round(performance.now() - t0)
    if (!res.ok) return rows.push({ id: c.id, tier: c.tier, mode, run, ms, error: `HTTP ${res.status}` })
    const a = (await res.json()).answers
    rows.push({ id: c.id, tier: c.tier, mode, run, ms, model: a?.model?.choice, effort: a?.effort?.choice, confidence: a?.model?.confidence ?? 0 })
  } catch (e) {
    rows.push({ id: c.id, tier: c.tier, mode, run, ms: Math.round(performance.now() - t0), error: String(e) })
  }
}

// 4 at a time: polite to the API, and latency stays representative.
const queue = [...jobs]
await Promise.all(Array.from({ length: 4 }, async () => { for (let j; (j = queue.shift()); ) await one(j) }))
writeFileSync(new URL('results/raw.json', import.meta.url), JSON.stringify(rows, null, 1))
console.log(`${rows.length} calls, ${rows.filter(r => r.error).length} errors`)
