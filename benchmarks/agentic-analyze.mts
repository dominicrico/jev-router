// Turns results/agentic.json into results/AGENTIC.md. No network.
import { readFileSync, writeFileSync } from 'node:fs'
const rows: any[] = JSON.parse(readFileSync(new URL('results/agentic.json', import.meta.url), 'utf8'))
const S = ['no plugin: always opus', 'no plugin: always sonnet', 'jev-router: per prompt', 'jev-router: every step + subagents']
const T = ['rename', 'bugfix', 'feature', 'subagent', 'refactor', 'hard']
const sum = (a: any[], f: string) => a.reduce((x, r) => x + (r[f] ?? 0), 0)
const table = (h: string[], b: string[][]) => [`| ${h.join(' | ')} |`, `|${h.map(() => '---').join('|')}|`, ...b.map(r => `| ${r.join(' | ')} |`)].join('\n')
const vs = (a: number, b: number) => `${a <= b ? '-' : '+'}${Math.abs(Math.round((1 - a / b) * 100))}%`
const of = (s: string, t?: string) => rows.filter(r => r.strategy === s && (!t || r.task === t))
const runs = Math.max(...S.map(s => of(s, 'bugfix').length))
const base = sum(of(S[0]!), 'usd'), sonnet = sum(of(S[1]!), 'usd')
const out = ['# Multi-step tasks with tools\n', `6 tasks on a small fixture repo, ${runs} runs each, real Claude Code runs with tools. "Done" is checked by a script (tests pass, the fix works, the files exist), not by reading the answer. Cost is what Claude Code reports, subagents included.\n`]
out.push('## Whole set\n', table(['strategy', 'tasks done', 'cost', 'vs always opus', 'vs always sonnet', 'output tokens', 'turns'], S.map(s => { const r = of(s); const c = sum(r, 'usd'); return [s, `${r.filter(x => x.ok).length}/${r.length}`, `$${c.toFixed(2)}`, s === S[0] ? '' : vs(c, base), s === S[1] ? '' : vs(c, sonnet), `${(sum(r, 'output') / 1000).toFixed(1)}k`, String(sum(r, 'turns'))] })))
out.push('\n## Per task (cost, tasks done)\n', table(['task', ...S], T.map(t => [t, ...S.map(s => { const r = of(s, t); return `$${sum(r, 'usd').toFixed(2)} · ${r.filter(x => x.ok).length}/${r.length}` })])))
const mix = (s: string) => { const m: Record<string, number> = {}; for (const r of of(s)) for (const [k, v] of Object.entries<any>(r.models ?? {})) m[k.replace('claude-', '')] = (m[k.replace('claude-', '')] ?? 0) + v.usd; const tot = Object.values(m).reduce((a, b) => a + b, 0); return Object.entries(m).map(([k, v]) => `${k} ${Math.round(100 * v / tot)}%`).join(', ') }
out.push('\n## Where the money went\n', table(['strategy', 'spend by model'], S.map(s => [s, mix(s)])))
writeFileSync(new URL('results/AGENTIC.md', import.meta.url), out.join('\n') + '\n')
console.log(out.join('\n'))
