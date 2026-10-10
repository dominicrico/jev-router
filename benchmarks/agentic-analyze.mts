// Turns results/agentic.json into results/AGENTIC.md. No network.
// CI=1 adds a Wilson 95% interval to the 'tasks done' cells of the whole-set table (off by default, output unchanged).
// RESULTS=results/agentic2.json (or FIXTURE=fixture2) reads the fixture2 run and writes results/AGENTIC2.md instead.
import { readFileSync, writeFileSync } from 'node:fs'
import { table, vs, sum, wilson } from './lib.mts'
const F2 = process.env.FIXTURE === 'fixture2' || /agentic2/.test(process.env.RESULTS ?? '')
const IN = process.env.RESULTS ?? (F2 ? 'results/agentic2.json' : 'results/agentic.json')
const OUTFILE = process.env.OUT ?? (/agentic2/.test(IN) ? 'results/AGENTIC2.md' : 'results/AGENTIC.md')
const rows: any[] = JSON.parse(readFileSync(new URL(IN, import.meta.url), 'utf8'))
const S = ['no plugin: always opus', 'no plugin: always sonnet', 'jev-router: per prompt', 'jev-router: every step + subagents', 'jev-router: !full', 'jev-router: ceiling sonnet', 'jev-router: lean (sonnet ceiling, cap medium)'].filter(s => rows.some(r => r.strategy === s))
const ORDER = ['rename', 'bugfix', 'feature', 'subagent', 'refactor', 'hard', 'queue', 'intervals', 'inventory', 'flaky']
const T = ORDER.filter(t => rows.some(r => r.task === t))
const of = (s: string, t?: string) => rows.filter(r => r.strategy === s && (!t || r.task === t))
const runs = Math.max(...S.map(s => of(s, T[0]).length))
const base = sum(of(S[0]!), 'usd'), sonnet = sum(of(S[1]!), 'usd')
const how = F2 ? 'checked by a hidden test the agent never saw (copied in after the run, and the visible tests must still pass)' : 'checked by a script (tests pass, the fix works, the files exist)'
const out = ['# Multi-step tasks with tools' + (F2 ? ', hard fixture' : '') + '\n', `${T.length} tasks on a small fixture repo, ${runs} runs each, real Claude Code runs with tools. "Done" is ${how}, not by reading the answer. Cost is what Claude Code reports, subagents included.\n`]
const done = (r: any[]) => { const d = r.filter(x => x.ok).length; if (process.env.CI !== '1') return `${d}/${r.length}`; const [lo, hi] = wilson(d, r.length); return `${d}/${r.length} (${Math.round(100 * lo)}-${Math.round(100 * hi)}%)` }
const perDone = (r: any[]) => { const d = r.filter(x => x.ok).length; return d ? `$${(sum(r, 'usd') / d).toFixed(2)}` : 'n/a' }
out.push('## Whole set\n', table(['strategy', 'tasks done', 'cost', 'vs always opus', 'vs always sonnet', 'output tokens', 'turns', ...(F2 ? ['cost per task done'] : [])], S.map(s => { const r = of(s); const c = sum(r, 'usd'); return [s, done(r), `$${c.toFixed(2)}`, s === S[0] ? '' : vs(c, base), s === S[1] ? '' : vs(c, sonnet), `${(sum(r, 'output') / 1000).toFixed(1)}k`, String(sum(r, 'turns')), ...(F2 ? [perDone(r)] : [])] })))
out.push('\n## Per task (cost, tasks done)\n', table(['task', ...S], T.map(t => [t, ...S.map(s => { const r = of(s, t); return `$${sum(r, 'usd').toFixed(2)} · ${r.filter(x => x.ok).length}/${r.length}` })])))
const mix = (s: string) => { const m: Record<string, number> = {}; for (const r of of(s)) for (const [k, v] of Object.entries<any>(r.models ?? {})) m[k.replace('claude-', '')] = (m[k.replace('claude-', '')] ?? 0) + v.usd; const tot = Object.values(m).reduce((a, b) => a + b, 0); return Object.entries(m).map(([k, v]) => `${k} ${Math.round(100 * v / tot)}%`).join(', ') }
out.push('\n## Where the money went\n', table(['strategy', 'spend by model'], S.map(s => [s, mix(s)])))
writeFileSync(new URL(OUTFILE, import.meta.url), out.join('\n') + '\n')
console.log(out.join('\n'))
