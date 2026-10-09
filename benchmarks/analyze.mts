// Turns results/raw.json into results/RESULTS.md. No network.
// usage: npx tsx --tsconfig benchmarks/tsconfig.json benchmarks/analyze.mts
import { readFileSync, writeFileSync } from 'node:fs'
import { decide } from '../hooks/register.tsx'
import { table, pct, mean } from './lib.mts'

const rows: any[] = JSON.parse(readFileSync(new URL('results/raw.json', import.meta.url), 'utf8')).filter((r: any) => !r.error)
const cases: any[] = JSON.parse(readFileSync(new URL('cases.json', import.meta.url), 'utf8'))
const MODES = ['efficient', 'balanced', 'cheap']
const TIERS = ['trivial', 'standard', 'hard']
const ALIASES = ['haiku', 'sonnet', 'opus', 'fable']
const IDS: Record<string, string> = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5', fable: 'claude-fable-5-1' }

// Relative price per token. haiku/sonnet/opus are the mod's own ~1x/3x/5x; fable is only "highest", so 10x is an assumption.
const W: Record<string, number> = { haiku: 1, sonnet: 3, opus: 5, fable: 10 }
// What a senior engineer would reasonably pick for each tier (the labels are the author's judgement).
const FIT: Record<string, string[]> = { trivial: ['haiku'], standard: ['sonnet'], hard: ['opus', 'fable'] }
const LEVEL: Record<string, number> = { haiku: 0, sonnet: 1, opus: 2, fable: 3 }
const NEED: Record<string, number> = { trivial: 0, standard: 1, hard: 2 }

const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))]!

const out: string[] = []
const by = (mode: string, tier?: string) => rows.filter(r => r.mode === mode && (!tier || r.tier === tier))

// 1. What does it pick?
out.push('## 1. What it picks\n', 'Share of calls that chose each model, per mode and task tier (3 runs of each of 30 tasks).\n')
out.push(table(['mode', 'tier', ...ALIASES, 'typical effort'], MODES.flatMap(m => TIERS.map(t => {
  const rs = by(m, t)
  const eff = [...new Set(rs.map(r => r.effort))].map(e => [e, rs.filter(r => r.effort === e).length] as const).sort((a, b) => b[1] - a[1])[0]?.[0]
  return [m, t, ...ALIASES.map(a => pct(rs.filter(r => r.model === a).length, rs.length)), String(eff)]
}))))

// 2. Fit
out.push('\n## 2. Does it match the task?\n', '**Fit**: the pick is the model an engineer would choose for that tier (trivial: haiku, standard: sonnet, hard: opus or fable). **Under**: weaker than the tier needs. **Over**: stronger than needed.\n')
out.push(table(['mode', 'fit', 'under', 'over'], MODES.map(m => {
  const rs = by(m)
  const fit = rs.filter(r => FIT[r.tier]!.includes(r.model)).length
  const under = rs.filter(r => LEVEL[r.model]! < NEED[r.tier]!).length
  return [m, pct(fit, rs.length), pct(under, rs.length), pct(rs.length - fit - under, rs.length)]
})))

// 3. Cost
out.push('\n## 3. Cost against fixed-model baselines\n', 'Relative cost per task, assuming every task uses the same number of tokens (haiku 1, sonnet 3, opus 5, fable 10 per token, the last one an assumption). Lower is cheaper. "vs" is the saving against that baseline.\n')
const avgCost = (rs: any[]) => mean(rs.map(r => W[r.model]!))
out.push(table(['strategy', 'cost / task', 'vs always opus', 'vs always sonnet'], [
  ['always haiku', '1.00', '', ''],
  ['always sonnet', '3.00', '', ''],
  ['always opus', '5.00', '', ''],
  ...MODES.map(m => { const c = avgCost(by(m)); return [`jev-router ${m}`, c.toFixed(2), `${Math.round((1 - c / 5) * 100)}%`, `${Math.round((1 - c / 3) * 100)}%`] }),
]))
const cheapBase = (m: string) => TIERS.map(t => `${t}: ${avgCost(by(m, t)).toFixed(2)}`).join(', ')
out.push('', `Cost per tier (${MODES.map(m => `${m} → ${cheapBase(m)}`).join(' | ')}).`)

// 4. Consistency
out.push('\n## 4. Does it give the same answer twice?\n')
out.push(table(['mode', 'same model on every run', 'same effort on every run'], MODES.map(m => {
  const g = Object.values(rows.filter(r => r.mode === m).reduce((a: any, r) => ((a[r.id] ??= []).push(r), a), {})) as any[][]
  return [m, pct(g.filter(x => new Set(x.map(r => r.model)).size === 1).length, g.length), pct(g.filter(x => new Set(x.map(r => r.effort)).size === 1).length, g.length)]
})))

// 5. Latency + confidence
const ms = rows.map(r => r.ms)
out.push('\n## 5. Overhead\n', `Time added before each task: p50 **${q(ms, 0.5)} ms**, p95 **${q(ms, 0.95)} ms**, max ${Math.max(...ms)} ms over ${rows.length} calls (the mod's timeout is 4000 ms). Mean confidence: ${MODES.map(m => `${m} ${mean(by(m).map(r => r.confidence)).toFixed(2)}`).join(', ')}.`)

// 6. Cache stickiness simulation
const mulberry = (a: number) => () => ((a = (a + 0x6d2b79f5) | 0), (((Math.imul(a ^ (a >>> 15), 1 | a) >>> 0) ^ ((a ^ (a >>> 7)) + Math.imul(a ^ (a >>> 7), 61 | a))) >>> 0) / 4294967296)
const rnd = mulberry(7)
const order = cases.map(c => c).sort(() => rnd() - 0.5)
const pickOf = (id: string) => { const r = rows.find(x => x.id === id && x.mode === 'balanced' && x.run === 0)!; return { alias: r.model, model: IDS[r.model]!, effort: r.effort, confidence: r.confidence } }
const cfg: any = { minConfidence: 0.7, minContextTokens: 8000, cacheTtlMs: 300_000 }
const sim = (sticky: 'off' | 'auto' | 'strict', gapMs = 90_000) => {
  let cache: any = null
  let ctx = 4000, switches = 0, rewritten = 0, kept = 0, cost = 0, rewriteCost = 0
  order.forEach((c, i) => {
    const now = i * gapMs
    const picked = decide(pickOf(c.id) as any, cache, now, cfg, sticky) as any
    if (cache && cache.model !== picked.model && ctx >= cfg.minContextTokens && now - cache.at <= cfg.cacheTtlMs) {
      switches++; rewritten += ctx
      rewriteCost += (ctx / 1000) * W[picked.alias]! * (1.25 - 0.1) // re-write at 1.25x instead of read at 0.1x
    }
    if (picked.kept) kept++
    cost += W[picked.alias]! * 10 // a 10k-token task
    ctx += 4000
    cache = { model: picked.model, at: now, contextTokens: ctx }
  })
  return { sticky, switches, rewritten, kept, cost, rewriteCost, total: cost + rewriteCost }
}
const sims = (['off', 'auto', 'strict'] as const).map(x => sim(x))
const cold = sim('auto', 400_000)
const fixed = (w: number) => 30 * w * 10
out.push('\n## 6. Cache stickiness (simulation)\n', `One session of the 30 tasks in a fixed random order, a task every 90 s, context growing 4k tokens per task from 4k. Each task uses Jev's real pick from the balanced mode. A model switch re-writes the whole context at 1.25x instead of reading it at 0.1x. **Caveat:** Jev was asked without cache info here, so in real use it also leans toward staying put; this simulation shows the mod's guard alone.\n`)
out.push(table(['strategy', 'model switches', 'tokens re-written', 'picks overridden', 'task cost', 'cache re-write cost', 'total'], [
  ['always sonnet (would under-serve the hard tasks)', '0', '0k', '0', String(fixed(3)), '0', `**${fixed(3)}**`],
  ['always opus', '0', '0k', '0', String(fixed(5)), '0', `**${fixed(5)}**`],
  ...sims.map(s => [`routed, stickiness ${s.sticky}`, String(s.switches), `${Math.round(s.rewritten / 1000)}k`, String(s.kept), s.cost.toFixed(0), s.rewriteCost.toFixed(0), `**${s.total.toFixed(0)}**`]),
  ['routed, tasks 400 s apart (cache cold)', String(cold.switches), `${Math.round(cold.rewritten / 1000)}k`, String(cold.kept), cold.cost.toFixed(0), cold.rewriteCost.toFixed(0), `**${cold.total.toFixed(0)}**`],
]))

writeFileSync(new URL('results/RESULTS.md', import.meta.url), out.join('\n') + '\n')
console.log(out.join('\n'))
