// Renders the README images from the benchmark results. HTML cards, screenshotted at 2x.
// usage: PW_DIR=/path/with/playwright-core node assets/src/make.mjs
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const res = p => join(here, '../../benchmarks/results', p)
const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core')
const raw = JSON.parse(readFileSync(res('raw.json'), 'utf8'))
const tok = Object.fromEntries(JSON.parse(readFileSync(res('tokens.json'), 'utf8')).map(r => [r.key, r]))
const cases = JSON.parse(readFileSync(join(here, '../../benchmarks/cases.json'), 'utf8'))
const ag = JSON.parse(readFileSync(res('agentic.json'), 'utf8'))
const logo = 'data:image/jpeg;base64,' + readFileSync(join(here, '../logo.jpg')).toString('base64')

const G = 'linear-gradient(90deg,#5eead4,#38bdf8)'
const CSS = `
*{box-sizing:border-box;margin:0}
body{background:#0b1020;font-family:-apple-system,'SF Pro Display','Inter',system-ui,sans-serif;color:#e2e8f0;-webkit-font-smoothing:antialiased}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace}
.card{width:880px;background:radial-gradient(900px 340px at 0% 0%,#14264a 0%,#0b1020 62%);border-radius:22px;border:1px solid #1e293b;padding:40px 44px 34px;overflow:hidden}
.eye{display:inline-block;font-size:12.5px;font-weight:600;color:#7dd3fc;background:#13203d;border:1px solid #1d3157;border-radius:999px;padding:5px 13px}
h1{font-size:31px;line-height:1.22;font-weight:700;margin:18px 0 28px;letter-spacing:-.02em}
.g{background:${G};-webkit-background-clip:text;color:transparent}
.foot{font-size:13.5px;color:#94a3b8;line-height:1.6;margin-top:24px}
.muted{color:#94a3b8}
`
const page = (body, w = 880) => `<!doctype html><meta charset=utf8><style>${CSS}</style><body style="width:${w}px">${body}`

// --- data ---------------------------------------------------------------
const MODES = ['efficient', 'balanced', 'cheap']
const pick = (id, m) => raw.find(r => r.id === id && r.mode === m && r.run === 0)
const EFF = ['low', 'medium', 'high', 'xhigh', 'max']
const cap = e => (EFF.indexOf(e) > EFF.indexOf('high') ? 'high' : e)
const cost = (id, m, capped = false) => {
  if (m === 'sonnet' || m === 'opus') return tok[`${id}|${m}|null`].usd
  const r = pick(id, m)
  return tok[`${id}|${r.model}|${capped ? cap(r.effort) : r.effort}`].usd
}
const sumCost = (tier, m, capped) => cases.filter(c => !tier || c.tier === tier).reduce((a, c) => a + cost(c.id, m, capped), 0)
const pctOpus = (tier, m, capped = false) => Math.round((100 * sumCost(tier, m, capped)) / sumCost(tier, 'opus'))
const groups = [['Trivial', 'trivial'], ['Standard', 'standard'], ['Hard', 'hard'], ['All 30', null]]
const FIT = { trivial: ['haiku'], standard: ['sonnet'], hard: ['opus', 'fable'] }
const LV = { haiku: 0, sonnet: 1, opus: 2, fable: 3 }, NEED = { trivial: 0, standard: 1, hard: 2 }
const fit = m => { const r = raw.filter(x => x.mode === m); return [Math.round(100 * r.filter(x => FIT[x.tier].includes(x.model)).length / r.length), Math.round(100 * r.filter(x => LV[x.model] < NEED[x.tier]).length / r.length)] }
const ms = raw.map(r => r.ms).sort((a, b) => a - b), q = p => ms[Math.floor(p * ms.length)]
const results = readFileSync(res('RESULTS.md'), 'utf8').split('## 6.')[1].split('\n').filter(l => /^\| (always|routed)/.test(l)).map(l => { const c = l.split('|').map(s => s.trim()); return [c[1], +c[7].replace(/\*/g, '')] })

// --- images --------------------------------------------------------------
const bar = (pct, max, label, labelCls = '', fill = G, h = 20) => `<div style="display:flex;align-items:center;gap:12px"><div style="width:${Math.max(6, (pct / max) * 560)}px;height:${h}px;border-radius:7px;background:${fill};${fill === G ? 'box-shadow:0 0 18px #38bdf855' : ''}"></div><span style="font-size:14px;font-weight:700;${labelCls}">${label}</span></div>`

const tick = (pct, max) => `<i style="position:absolute;left:${(pct / max) * 560 - 1}px;top:-3px;width:3px;height:20px;border-radius:2px;background:#fbbf24"></i>`
const crow = (label, pct, unc, max) => `<div style="display:flex;align-items:center;gap:12px"><span class=mono style="width:78px;font-size:12px;color:#94a3b8">${label}</span><div style="position:relative;width:${(max / max) * 560}px;height:14px;background:#111a30;border-radius:7px"><div style="width:${Math.max(5, (pct / max) * 560)}px;height:14px;border-radius:7px;background:${G}"></div>${unc > pct ? tick(unc, max) : ''}</div><span class=mono style="font-size:13px;font-weight:700;color:${pct > 100 ? '#fbbf24' : '#e2e8f0'}">${pct}%</span></div>`
const costCard = `<div class=card><div class=eye>Benchmark · 30 tasks · 147 real runs</div>
<h1>With the default cap, every mode lands at or below always-opus. Easy tasks cost <span class=g>97% less</span>.</h1>
<div style="display:grid;grid-template-columns:96px 1fr;row-gap:22px;position:relative">
${groups.map(([name, tier]) => `<div style="font-size:16px;font-weight:700;padding-top:2px">${name}</div><div style="display:grid;gap:7px">
 ${MODES.map(m => crow(m, pctOpus(tier, m, true), pctOpus(tier, m, false), 360)).join('')}</div>`).join('')}
</div>
<div style="display:flex;gap:22px;margin-top:24px;font-size:13px;color:#94a3b8;flex-wrap:wrap;align-items:center">
 <span><i style="display:inline-block;width:22px;height:8px;border-radius:4px;background:${G};vertical-align:0"></i> jev-router, effort capped at high (default)</span>
 <span><i style="display:inline-block;width:3px;height:14px;border-radius:2px;background:#fbbf24;vertical-align:-3px"></i> same mode, uncapped</span></div>
<div class=foot>Cost as % of always opus at its default effort (= 100%), real runs with no tools in an empty directory. Always sonnet would be ${pctOpus(null, 'sonnet')}% overall. The cap only matters on hard tasks, where Jev asks for xhigh effort. Multi-step runs check the task got done. Quality is measured on the tool-using tasks only.</div></div>`

const [fE, uE] = fit('efficient'), [fB, uB] = fit('balanced'), [fC, uC] = fit('cheap')
const fitCard = `<div class=card><div class=eye>Routing fit · 30 tasks × 3 modes × 3 runs</div>
<h1>It picks the model the task <span class=g>actually needs</span>.</h1>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px">
${[['efficient', fE, uE], ['balanced', fB, uB], ['cheap', fC, uC]].map(([m, f, u]) => `<div style="border:1px solid #1e293b;background:#0e1730;border-radius:16px;padding:20px">
 <div class=eye style="font-size:12px">${m}</div>
 <div style="font-size:58px;font-weight:700;margin:10px 0 4px;line-height:1" class="g mono">${f}%</div>
 <div style="font-size:14px">fit the task</div>
 <div style="font-size:13px;color:${u ? '#fbbf24' : '#94a3b8'};margin-top:10px">${u}% under-served</div></div>`).join('')}</div>
<div style="margin-top:26px;border-top:1px solid #1e293b;padding-top:22px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px">
 <div><div class=mono style="font-size:28px;font-weight:700">100%</div><div class=muted style="font-size:13px">trivial tasks on haiku,<br>standard on sonnet</div></div>
 <div><div class=mono style="font-size:28px;font-weight:700">${q(0.5)} ms</div><div class=muted style="font-size:13px">added per task, p95 ${q(0.95)} ms</div></div>
 <div><div class=mono style="font-size:28px;font-weight:700">97–100%</div><div class=muted style="font-size:13px">same pick on every repeat</div></div></div>
<div class=foot>Fit means the pick matches what an engineer would choose for the tier: trivial haiku, standard sonnet, hard opus or fable. Tier labels are the author's. Measures what Jev picks, not answer quality.</div></div>`

const sess = JSON.parse(readFileSync(res('session-long.json'), 'utf8')).filter(x => x.complete)
const SN = [['no plugin: always opus', 'always opus', '#475569'], ['no plugin: always sonnet', 'always sonnet', '#64748b'], ['jev-router: stickiness auto', 'jev-router, cache guard on (auto)', G], ['jev-router: stickiness off', 'jev-router, cache guard off', 'linear-gradient(90deg,#fbbf24,#fb7185)']]
const sMean = (st, f) => { const r = sess.filter(x => x.strategy === st); return r.reduce((a, x) => a + f(x), 0) / r.length }
const sCost = st => sMean(st, x => x.totalUsd), sSw = st => sMean(st, x => x.switches), sCw = st => sMean(st, x => x.turns.reduce((a, t) => a + (t.cacheWrite ?? 0), 0))
const sMax = Math.max(...SN.map(([st]) => sCost(st)))
const cacheCard = `<div class=card><div class=eye>Cache guard · measured · ${sess.length / SN.length} long sessions of 8 tasks per strategy</div>
<h1>The guard cut cache re-writes by <span class=g>${Math.round(100 - (100 * sCw(SN[2][0])) / sCw(SN[3][0]))}%</span>. In a long warm session routing still cost more than opus.</h1>
<div style="display:grid;gap:15px">${SN.map(([st, label, fill]) => `<div><div style="font-size:14px;margin-bottom:6px">${label}</div><div style="display:flex;align-items:center;gap:12px"><div style="width:${(sCost(st) / sMax) * 480}px;height:14px;border-radius:7px;background:${fill}"></div><span class=mono style="font-size:13px;font-weight:700">$${sCost(st).toFixed(2)}</span><span class=mono style="font-size:12px;color:#94a3b8">${sSw(st).toFixed(1)} switches · ${Math.round(sCw(st) / 1000)}k cache writes</span></div></div>`).join('')}</div>
<div class=foot>Mean per session, real runs: one long Claude Code process per session, about 20k tokens of source pasted first so the cache is large, then 8 mixed tasks. A model switch re-writes the whole warm context. The guard helped (+${Math.round((100 * sCost(SN[2][0])) / sCost(SN[0][0]) - 100)}% against opus instead of +${Math.round((100 * sCost(SN[3][0])) / sCost(SN[0][0]) - 100)}%), but staying on one model was cheaper. Routing pays when the cache is cold or the context is small.</div></div>`

const rows = [['1', 'A task arrives', 'your prompt'], ['2', 'Ask Jev: which model, which effort?', `~${q(0.5)} ms per call`], ['3', 'Is the prompt cache warm?', 'stay put unless Jev is sure'], ['4', 'Cap the effort at high', '!full lifts it for one prompt'], ['5', 'Re-ask before each step, route each subagent', 'routeSteps, routeSubagents'], ['6', 'Show it above the prompt', 'the band']]
const howCard = `<div class=card><div class=eye>How it works</div>
<h1>Before every task, one lever. <span class=g>Then it gets out of the way.</span></h1>
<div style="border-top:1px solid #1e293b">${rows.map(([n, a, b], i) => `<div style="display:flex;align-items:center;padding:16px 4px;border-bottom:1px solid #1e293b;font-size:17px"><span style="width:56px;color:${i === 5 ? '#5eead4' : '#94a3b8'};font-weight:${i === 5 ? 700 : 400}">${n}</span><span style="flex:1;font-weight:${i === 5 ? 700 : 400}">${a}</span><span style="font-size:14px;color:#94a3b8">${b}</span></div>`).join('')}</div>
<div class=foot>Jev slow or unreachable? Your session model keeps working and you get one polite message.</div></div>`

const seg = (t, c, b) => `<span style="color:${c};${b ? 'font-weight:800' : ''}">${t}</span>`
const sep = seg('  │  ', '#475569')
const bandCard = `<div class=card><div class=eye>The band</div>
<h1>What it picked, <span class=g>right above your prompt</span>.</h1>
<div style="background:#070b17;border:1px solid #1e293b;border-radius:16px;padding:22px 22px 18px;font-size:12.4px;line-height:2;white-space:pre;overflow:hidden">${seg('◆ JEV ', '#c084fc', 1)}${seg('▏balanced▕  ', '#94a3b8')}${seg('sonnet ▂▄__', '#60a5fa', 1)}${sep}${seg('high ▰▰▰▱▱ ⤓xhigh', '#38bdf8')}${sep}${seg('conf ▮▮▮▮▯ 88%', '#4ade80')}${sep}${seg('cache 🔒 warm 42k', '#4ade80')}
<span class=muted>&gt; </span><span style="color:#e2e8f0">fix the time zone bug in the date picker</span><span style="background:#e2e8f0;color:#e2e8f0">_</span></div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:22px;font-size:13.5px">
${[['#4ade80', 'haiku', 'trivial'], ['#60a5fa', 'sonnet', 'standard'], ['#c084fc', 'opus', 'hard'], ['#fbbf24', 'fable', 'hardest']].map(([c, n, d]) => `<div style="border:1px solid #1e293b;border-radius:14px;padding:14px"><div style="color:${c};font-weight:800;font-size:16px">${n}</div><div class=muted>${d}</div></div>`).join('')}</div>
<div class=foot>The mark spins while a task runs. <span class=mono>⤓xhigh</span> means the cap lowered Jev's effort; 🔓 means the prompt ran uncapped. Confidence turns amber under 70% and red under 50%.</div></div>`


const AS = [['no plugin: always opus', 'always opus', '#475569'], ['no plugin: always sonnet', 'always sonnet', '#64748b'], ['jev-router: per prompt', 'jev-router, per prompt', G], ['jev-router: every step + subagents', 'jev-router, every step + subagents', G]]
const AS2 = [...AS, ['jev-router: !full', 'jev-router, !full', G], ['jev-router: ceiling sonnet', 'jev-router, ceiling sonnet', G]]
const ag2 = JSON.parse(readFileSync(res('agentic2.json'), 'utf8'))
const aCost = (st, t, rows = ag) => rows.filter(r => r.strategy === st && (!t || r.task === t)).reduce((a, r) => a + r.usd, 0)
const aDone = (st, rows = ag) => { const r = rows.filter(x => x.strategy === st); return `${r.filter(x => x.ok).length}/${r.length}` }
const aBase = aCost(AS[0][0])
const strategyCard = (rows, list, eye, h1, foot) => {
  const base = aCost(list[0][0], undefined, rows)
  const row = ([st, label, fill]) => { const pc = Math.round((100 * aCost(st, undefined, rows)) / base); return `<div style="display:flex;align-items:center;gap:12px"><span class=mono style="width:210px;font-size:12px;color:#94a3b8">${label}</span><div style="width:${Math.min(pc, 110) / 100 * 320}px;height:14px;border-radius:7px;background:${fill}"></div><span class=mono style="font-size:13px;font-weight:700">${pc}%</span></div>` }
  const cols = list.length
  return `<div class=card><div class=eye>${eye}</div><h1>${h1}</h1>
<div style="display:grid;gap:12px">${list.map(row).join('')}</div>
<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px;margin-top:26px">
${list.map(([st, label]) => `<div style="border:1px solid #1e293b;background:#0e1730;border-radius:14px;padding:14px"><div class=mono style="font-size:20px;font-weight:700">$${aCost(st, undefined, rows).toFixed(2)}</div><div class=muted style="font-size:11.5px;margin:3px 0 6px">${label}</div><div style="font-size:13px;color:#5eead4">${aDone(st, rows)} done</div></div>`).join('')}</div>
<div class=foot>${foot}</div></div>`
}
const agenticCard = strategyCard(ag, AS, `Benchmark · 6 multi-step tasks · ${ag.length} real runs with tools`, `Same tasks done, <span class=g>${Math.round(100 - (100 * aCost(AS[3][0])) / aBase)}% cheaper</span> than always opus.`, 'Cost as % of always opus (= 100%). A script checks each task is really done: tests pass, the fix works, the files exist. 3 runs each on a small fixture repo. The extra saving from routing every step and subagent comes mostly from the subagent task. All four strategies finished 18 of 18, but these are not hard tasks.')
const hardCard = strategyCard(ag2, AS2, `Benchmark · 4 harder tasks · ${ag2.length} real runs, graded by hidden tests`, `A sonnet ceiling finished <span class=g>20 of 20</span> hard tasks for half of opus's cost.`, 'Cost as % of always opus (= 100%). Each task is graded by a hidden test the agent never saw. 5 runs each. Pass counts differ by at most two runs, which is noise at this size. Always sonnet is still the cheapest; the ceiling keeps jev-router close to it while Jev can still pick opus when it is 90% sure.')

const lanes = [['haiku', '#4ade80', 85, ['rename usr to user', 'fix typo in README']], ['sonnet', '#60a5fa', 185, ['add /health endpoint + test']], ['opus', '#c084fc', 285, ['double-charge root cause', 'migrate auth to JWT']], ['fable', '#fbbf24', 385, []]]
const hero = `<div style="width:880px;height:495px;position:relative;background:radial-gradient(700px 420px at 18% 40%,#16305f 0%,#0b1020 65%);overflow:hidden">
<svg width="480" height="495" style="position:absolute;left:0;top:0">
${lanes.map(([n, c, y]) => `<path d="M118 245 C 200 245, 190 ${y + 20}, 270 ${y + 20} L 450 ${y + 20}" stroke="${c}" stroke-width="3" fill="none" opacity=".75"/><circle cx="450" cy="${y + 20}" r="5" fill="${c}"/>`).join('')}
</svg>
${lanes.map(([n, c, y, ts]) => `<div class=mono style="position:absolute;left:280px;top:${y - 8}px;font-size:12px;font-weight:700;color:${c}">${n}</div>${ts.map((t, i) => `<div style="position:absolute;left:${280 + i * 0}px;top:${y + 36 + i * 24}px;font-size:11px;color:#cbd5e1;background:#101a33;border:1px solid #1e293b;border-radius:8px;padding:3px 9px;white-space:nowrap">${t}</div>`).join('')}`).join('')}
<img src="${logo}" style="position:absolute;left:52px;top:205px;width:80px;height:80px;border-radius:50%;border:2px solid #26334f">
<div style="position:absolute;left:30px;top:22px" class="eye mono">~/jev-router</div>
<div style="position:absolute;left:500px;top:62px;right:30px">
<div class=eye>Claude Code mod</div>
<div style="font-size:58px;font-weight:700;line-height:1.05;margin-top:16px;letter-spacing:-.03em">jev-<span class=g>router</span></div>
<div style="font-size:19px;margin-top:12px;color:#cbd5e1">Right model. Right effort.<br>Every task.</div>
<div style="display:flex;gap:20px;margin-top:28px">
${[[`-${100 - pctOpus('trivial', 'cheap', true)}%`, 'cost, trivial'], [`-${100 - pctOpus('standard', 'balanced', true)}%`, 'cost, standard'], [`-${Math.round(100 - (100 * aCost(AS[3][0])) / aBase)}%`, 'multi-step tasks'], [`${q(0.5)}ms`, 'per pick']].map(([v, l]) => `<div><div class=mono style="font-size:24px;font-weight:700">${v}</div><div class=muted style="font-size:11.5px;margin-top:2px">${l}</div></div>`).join('')}</div>
<div style="margin-top:28px;font-size:15px"><i class=muted>And yet</i> <b style="font-size:21px" class=g>hard tasks cost more.</b></div>
<div style="font-size:12.5px;margin-top:6px" class=muted>Jev buys deeper reasoning there: +${pctOpus('hard', 'balanced', true) - 100}% to +${pctOpus('hard', 'efficient', true) - 100}% at the default cap of high.<br>Lift it for one prompt with <span class=mono style="color:#5eead4">!full</span>.</div></div>
<div style="position:absolute;left:0;right:0;bottom:0;padding:12px 30px 16px;font-size:11px" class=muted>30 tasks, 270 Jev calls, ${147 + ag.length + ag2.length} real runs. Opus 5.5, Sonnet 5.5, Haiku 5.5. Multi-step runs check the task got done. Quality is measured on the tool-using tasks only.</div></div>`

mkdirSync(join(here, '..'), { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME })
const shoot = async (html, out, w, type = 'png') => {
  const p = await browser.newPage({ viewport: { width: w, height: 400 }, deviceScaleFactor: 2 })
  await p.setContent(page(html, w)); await p.evaluate(() => document.fonts.ready)
  await p.locator('body > *').first().screenshot({ path: join(here, '..', out), type, ...(type === 'jpeg' ? { quality: 92 } : { omitBackground: true }) })
  await p.close()
}
await shoot(hero, 'hero.jpg', 880, 'jpeg')
await shoot(costCard, 'cost.png', 880); await shoot(fitCard, 'fit.png', 880); await shoot(cacheCard, 'cache.png', 880)
await shoot(howCard, 'how.png', 880); await shoot(agenticCard, 'agentic.png', 880); await shoot(hardCard, 'hard.png', 880); await shoot(bandCard, 'band.png', 880)
await browser.close()
// the GitHub Pages site serves its own copies
for (const f of ['hero.jpg', 'band.gif', 'cost.png', 'fit.png', 'hard.png', 'agentic.png', 'cache.png', 'how.png', 'logo.jpg']) cpSync(join(here, '..', f), join(here, '../../docs/assets', f))
