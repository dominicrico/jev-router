// Turns results/session.json into results/SESSION.md. Complete sessions only. No network.
import { readFileSync, writeFileSync } from 'node:fs'
import { table, vs, sum, k } from './lib.mts'
const all: any[] = JSON.parse(readFileSync(new URL('results/session.json', import.meta.url), 'utf8'))
const rows = all.filter(s => s.complete)
const S = ['no plugin: always opus', 'no plugin: always sonnet', 'jev-router: stickiness auto', 'jev-router: stickiness off'].filter(s => rows.some(r => r.strategy === s))
const of = (s: string) => rows.filter(r => r.strategy === s)
const short = (m?: string) => (m ?? '?').replace('claude-', '').replace(/-\d.*$/, '')
const base = sum(of(S[0]!), s => s.totalUsd) / Math.max(1, of(S[0]!).length)
const turns = (s: string) => of(s).flatMap(r => r.turns)

const out = ['# One long session, cache warm\n', `8 mixed tasks (3 trivial, 3 standard, 2 hard) replayed as one multi-turn conversation per strategy, tools off, ${Math.max(...S.map(s => of(s).length))} sessions per strategy (${all.length - rows.length} incomplete sessions left out). Turn 1 starts the session, turns 2 to 8 resume it, so each turn re-reads the cache the previous one wrote. Cost is what Claude Code reports. A switch is two consecutive turns carried by different models (the model with the largest cost in that turn's modelUsage).\n`]
out.push('## Per strategy (means per session)\n', table(['strategy', 'sessions', 'total cost', 'vs always opus', 'model switches', 'cache write tokens', 'cache read tokens', 'output tokens'], S.map(s => {
  const r = of(s), n = r.length, c = sum(r, x => x.totalUsd) / n
  return [s, String(n), `$${c.toFixed(3)}`, s === S[0] ? '' : vs(c, base), (sum(r, x => x.switches) / n).toFixed(1), k(sum(turns(s), t => t.cacheWrite) / n), k(sum(turns(s), t => t.cacheRead) / n), k(sum(turns(s), t => t.out) / n)]
})))
const mix = (s: string) => { const m: Record<string, number> = {}; for (const t of turns(s)) for (const [id, v] of Object.entries<any>(t.models)) m[short(id)] = (m[short(id)] ?? 0) + v.usd; const tot = Object.values(m).reduce((a, b) => a + b, 0); return Object.entries(m).map(([id, v]) => `${id} ${Math.round(100 * v / tot)}%`).join(', ') }
out.push('\n## Spend by model\n', table(['strategy', 'spend by model'], S.map(s => [s, mix(s)])))
out.push('\n## Model per turn, first session of each strategy\n', table(['strategy', 'task order', 'model per turn', 'cost per turn'], S.map(s => { const r = of(s).sort((a, b) => a.session - b.session)[0]; return r ? [s, r.order.join(' '), r.turns.map((t: any) => short(t.model)).join(' '), r.turns.map((t: any) => `$${t.usd.toFixed(3)}`).join(' ')] : [s, '', '', ''] })))
out.push('\n## Per session\n', table(['strategy', 'session', 'total cost', 'switches', 'cache write', 'cache read'], S.flatMap(s => of(s).sort((a, b) => a.session - b.session).map(r => [s, String(r.session), `$${r.totalUsd.toFixed(3)}`, String(r.switches), k(sum(r.turns, (t: any) => t.cacheWrite)), k(sum(r.turns, (t: any) => t.cacheRead))]))))
writeFileSync(new URL('results/SESSION.md', import.meta.url), out.join('\n') + '\n')
console.log(out.join('\n'))
