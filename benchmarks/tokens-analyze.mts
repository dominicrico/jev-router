// Turns results/tokens.json into results/TOKENS.md. No network.
import { readFileSync, writeFileSync } from 'node:fs'
import { capEffort } from '../hooks/register.tsx'
import { table, vs, sum, k } from './lib.mts'

const cases: any[] = JSON.parse(readFileSync(new URL('cases.json', import.meta.url), 'utf8'))
const raw: any[] = JSON.parse(readFileSync(new URL('results/raw.json', import.meta.url), 'utf8'))
const runs: any[] = JSON.parse(readFileSync(new URL('results/tokens.json', import.meta.url), 'utf8'))
const byKey = Object.fromEntries(runs.map(r => [r.key, r]))
const TIERS = ['trivial', 'standard', 'hard']

const STRATS: Record<string, (id: string) => string> = {
  'no plugin: always opus': id => `${id}|opus|null`,
  'no plugin: always sonnet': id => `${id}|sonnet|null`,
  ...Object.fromEntries(['efficient', 'balanced', 'cheap'].flatMap(m => [
    [`jev-router ${m} (cap high, the default)`, (id: string) => {
      const r = raw.find(x => x.id === id && x.mode === m && x.run === 0)
      return `${id}|${r.model}|${capEffort(r.effort, 'high').effort}`
    }],
    [`jev-router ${m} (uncapped)`, (id: string) => {
      const r = raw.find(x => x.id === id && x.mode === m && x.run === 0)
      return `${id}|${r.model}|${r.effort}`
    }],
  ])),
}
const ok = cases.filter(c => Object.values(STRATS).every(k => byKey[k(c.id)] && !byKey[k(c.id)].error))
const skipped = cases.length - ok.length
const rowsOf = (s: string, tier?: string) => ok.filter(c => !tier || c.tier === tier).map(c => byKey[STRATS[s]!(c.id)])
const usd = (n: number) => `$${n.toFixed(n < 0.1 ? 3 : 2)}`

const out: string[] = ['# Token usage and cost\n', `${ok.length} tasks measured${skipped ? `, ${skipped} skipped for errors` : ''}. Each task ran once per strategy, headless, with no tools, in an empty directory. Output tokens include thinking tokens. Cost is the dollar figure Claude Code reports.\n`]
const base = 'no plugin: always opus'
out.push('## Whole task set\n', table(['strategy', 'output tokens', 'input tokens', 'cost', 'cost vs always opus', 'output vs always opus', 'cost vs always sonnet'],
  Object.keys(STRATS).map(s => { const r = rowsOf(s); const b = rowsOf(base); const sn = rowsOf('no plugin: always sonnet')
    return [s, k(sum(r, 'output')), k(sum(r, 'input')), usd(sum(r, 'usd')), s === base ? '' : vs(sum(r, 'usd'), sum(b, 'usd')), s === base ? '' : vs(sum(r, 'output'), sum(b, 'output')), s.includes('jev') ? vs(sum(r, 'usd'), sum(sn, 'usd')) : ''] })))
for (const t of TIERS) {
  out.push(`\n## ${t[0]!.toUpperCase() + t.slice(1)} tasks\n`, table(['strategy', 'output tokens', 'cost', 'cost vs always opus'], Object.keys(STRATS).map(s => {
    const r = rowsOf(s, t); return [s, k(sum(r, 'output')), usd(sum(r, 'usd')), s === base ? '' : vs(sum(r, 'usd'), sum(rowsOf(base, t), 'usd'))] })))
}
out.push('\n## Effort held equal\n', 'Jev also picks the reasoning effort, and effort drives token use far more than the model does. Here each router mode is compared with **opus at the same effort Jev chose**, so the only difference is the model.\n')
const matched = (m: string) => (id: string) => { const r = raw.find(x => x.id === id && x.mode === m && x.run === 0); return `${id}|opus|${r.effort}` }
const okM = ok.filter(c => ['efficient', 'balanced', 'cheap'].every(m => byKey[matched(m)(c.id)] && !byKey[matched(m)(c.id)].error))
out.push(table(['mode', 'tier', 'router output', 'opus same effort output', 'router cost', 'opus same effort cost', 'cost saved'], ['efficient', 'balanced', 'cheap'].flatMap(m => TIERS.map(t => {
  const cs = okM.filter(c => c.tier === t)
  const a = cs.map(c => byKey[STRATS[`jev-router ${m} (uncapped)`]!(c.id)]); const b = cs.map(c => byKey[matched(m)(c.id)])
  return [m, t, k(sum(a, 'output')), k(sum(b, 'output')), usd(sum(a, 'usd')), usd(sum(b, 'usd')), vs(sum(a, 'usd'), sum(b, 'usd'))]
}))))
out.push('\n## Effort alone\n', 'The same model (opus) at its default effort against opus at the effort Jev chose, hard tasks only. Shows what the effort setting costs, apart from any routing.\n')
const hard = okM.filter(c => c.tier === 'hard')
out.push(table(['opus effort', 'output tokens', 'cost'], [
  ['default (no plugin)', k(sum(hard.map(c => byKey[`${c.id}|opus|null`]), 'output')), usd(sum(hard.map(c => byKey[`${c.id}|opus|null`]), 'usd'))],
  ...['efficient', 'balanced', 'cheap'].map(m => [`as Jev picks in ${m}`, k(sum(hard.map(c => byKey[matched(m)(c.id)]), 'output')), usd(sum(hard.map(c => byKey[matched(m)(c.id)]), 'usd'))]),
]))
writeFileSync(new URL('results/TOKENS.md', import.meta.url), out.join('\n') + '\n')
console.log(out.join('\n'))
