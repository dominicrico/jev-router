// Renders the README images from the benchmark results. HTML cards, screenshotted at 2x.
// usage: PW_DIR=/path/with/playwright-core node assets/src/make.mjs
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const res = p => join(here, '../../benchmarks/results', p)
const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core')
const raw = JSON.parse(readFileSync(res('raw.json'), 'utf8'))
const tok = Object.fromEntries(JSON.parse(readFileSync(res('tokens.json'), 'utf8')).map(r => [r.key, r]))
const cases = JSON.parse(readFileSync(join(here, '../../benchmarks/cases.json'), 'utf8'))
const logo = 'data:image/jpeg;base64,' + readFileSync(join(here, '../logo.jpg')).toString('base64')

const G = 'linear-gradient(90deg,#7dd3fc,#c4b5fd,#f9a8d4)'
const CSS = `
*{box-sizing:border-box;margin:0}
body{background:#0e0d0c;font-family:'JetBrains Mono',ui-monospace,monospace;color:#f0e8dc;-webkit-font-smoothing:antialiased}
.card{width:880px;background:#0e0d0c;border-radius:28px;border:1px solid #23201d;padding:44px 44px 36px;overflow:hidden}
.eye{font-size:13px;letter-spacing:.28em;color:#8c8478;text-transform:uppercase}
h1{font-size:32px;line-height:1.25;font-weight:800;margin:14px 0 30px;letter-spacing:-.01em}
.g{background:${G};-webkit-background-clip:text;color:transparent}
.foot{font-size:13.5px;color:#8c8478;line-height:1.55;margin-top:26px}
.muted{color:#8c8478}
`
const page = (body, w = 880) => `<!doctype html><meta charset=utf8><style>${CSS}</style><body style="width:${w}px">${body}`

// --- data ---------------------------------------------------------------
const MODES = ['efficient', 'balanced', 'cheap']
const pick = (id, m) => raw.find(r => r.id === id && r.mode === m && r.run === 0)
const cost = (id, m) => tok[`${id}|${m === 'sonnet' || m === 'opus' ? m : pick(id, m).model}|${m === 'sonnet' || m === 'opus' ? null : pick(id, m).effort}`].usd
const groups = [['Trivial', 'trivial'], ['Standard', 'standard'], ['Hard', 'hard'], ['All 30', null]]
const sumCost = (tier, m) => cases.filter(c => !tier || c.tier === tier).reduce((a, c) => a + cost(c.id, m), 0)
const pctOpus = (tier, m) => Math.round((100 * sumCost(tier, m)) / sumCost(tier, 'opus'))
const FIT = { trivial: ['haiku'], standard: ['sonnet'], hard: ['opus', 'fable'] }
const LV = { haiku: 0, sonnet: 1, opus: 2, fable: 3 }, NEED = { trivial: 0, standard: 1, hard: 2 }
const fit = m => { const r = raw.filter(x => x.mode === m); return [Math.round(100 * r.filter(x => FIT[x.tier].includes(x.model)).length / r.length), Math.round(100 * r.filter(x => LV[x.model] < NEED[x.tier]).length / r.length)] }
const ms = raw.map(r => r.ms).sort((a, b) => a - b), q = p => ms[Math.floor(p * ms.length)]
const results = readFileSync(res('RESULTS.md'), 'utf8').split('## 6.')[1].split('\n').filter(l => /^\| (always|routed)/.test(l)).map(l => { const c = l.split('|').map(s => s.trim()); return [c[1], +c[7].replace(/\*/g, '')] })

// --- images --------------------------------------------------------------
const bar = (pct, max, label, labelCls = '', fill = G, h = 20) => `<div style="display:flex;align-items:center;gap:12px"><div style="width:${Math.max(6, (pct / max) * 560)}px;height:${h}px;border-radius:7px;background:${fill};${fill === G ? 'box-shadow:0 0 18px #c4b5fd55' : ''}"></div><span style="font-size:14px;font-weight:700;${labelCls}">${label}</span></div>`

const costCard = `<div class=card><div class=eye>Benchmark · 30 tasks · 131 real runs</div>
<h1>Easy tasks cost <span class=g>97% less</span>. Hard ones cost what the reasoning costs.</h1>
<div style="display:grid;grid-template-columns:120px 1fr;row-gap:22px;position:relative"><div style="position:absolute;left:280px;top:-6px;bottom:-4px;border-left:1px dashed #5f5750"></div><div style="position:absolute;left:286px;top:-26px;font-size:11px;color:#8c8478">always opus = 100%</div>
${groups.map(([name, tier]) => `<div style="font-size:17px;font-weight:700;padding-top:2px">${name}</div><div style="display:grid;gap:7px">
 ${bar(pctOpus(tier, 'sonnet'), 350, `${pctOpus(tier, 'sonnet')}%`, 'color:#8c8478;font-weight:400', '#5f5750', 14)}
 ${MODES.map(m => `<div style="display:flex;align-items:center;gap:12px">${bar(pctOpus(tier, m), 350, `${pctOpus(tier, m)}%`, pctOpus(tier, m) > 100 ? 'color:#f9a8d4' : 'color:#f0e8dc', G, 14)}</div>`).join('')}</div>`).join('')}
</div>
<div style="display:flex;gap:22px;margin-top:26px;font-size:13.5px;color:#8c8478;flex-wrap:wrap">
 <span><i style="display:inline-block;width:12px;height:12px;border-radius:4px;background:#5f5750;vertical-align:-1px"></i> always sonnet</span>
 <span><i style="display:inline-block;width:12px;height:12px;border-radius:4px;background:${G};vertical-align:-1px"></i> jev-router: efficient, balanced, cheap (top to bottom)</span></div>
<div class=foot>Cost as % of always opus at its default effort (= 100%). Real runs, no tools, empty directory. Hard tasks: Jev asks for xhigh effort, so efficient and balanced think longer than opus does by default. Only cheap is cheaper overall (${pctOpus(null, 'cheap')}%).</div></div>`

const [fE, uE] = fit('efficient'), [fB, uB] = fit('balanced'), [fC, uC] = fit('cheap')
const fitCard = `<div class=card><div class=eye>Routing fit · 30 tasks × 3 modes × 3 runs</div>
<h1>It picks the model the task <span class=g>actually needs</span>.</h1>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px">
${[['efficient', fE, uE], ['balanced', fB, uB], ['cheap', fC, uC]].map(([m, f, u]) => `<div style="border:1px solid #23201d;border-radius:20px;padding:22px 20px">
 <div class=eye style="letter-spacing:.2em;font-size:12px">${m}</div>
 <div style="font-size:60px;font-weight:800;margin:10px 0 4px;line-height:1" class=g>${f}%</div>
 <div style="font-size:14px">fit the task</div>
 <div style="font-size:13px;color:${u ? '#f9a8d4' : '#8c8478'};margin-top:10px">${u}% under-served</div></div>`).join('')}</div>
<div style="margin-top:26px;border-top:1px solid #23201d;padding-top:22px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px">
 <div><div style="font-size:30px;font-weight:800">100%</div><div class=muted style="font-size:13px">trivial tasks on haiku,<br>standard on sonnet</div></div>
 <div><div style="font-size:30px;font-weight:800">${q(0.5)} ms</div><div class=muted style="font-size:13px">added per task, p95 ${q(0.95)} ms</div></div>
 <div><div style="font-size:30px;font-weight:800">97–100%</div><div class=muted style="font-size:13px">same pick on every repeat</div></div></div>
<div class=foot>Fit means the pick matches what an engineer would choose for the tier: trivial haiku, standard sonnet, hard opus or fable. Tier labels are the author's. Measures what Jev picks, not answer quality.</div></div>`

const mx = Math.max(...results.map(r => r[1]))
const cacheCard = `<div class=card><div class=eye>Cache guard · simulated session · 30 mixed tasks</div>
<h1>Following every pick in a long session costs <span class=g>3× more</span>. The guard stops that.</h1>
<div style="display:grid;gap:15px">${results.map(([n, v]) => `<div><div style="font-size:14px;margin-bottom:6px;${/stickiness off/.test(n) ? 'color:#f9a8d4' : ''}">${n}</div>${bar(v, mx, v, '', /stickiness off/.test(n) ? 'linear-gradient(90deg,#f9a8d4,#fb7185)' : /always/.test(n) ? '#5f5750' : G, 16)}</div>`).join('')}</div>
<div class=foot>Relative cost, lower is better. A switch re-writes the whole warm context at 1.25× instead of reading it at 0.1×. With tasks 5+ minutes apart the cache is cold, switching is free, and routing wins outright. Jev was asked without cache info here, so this isolates the mod's guard.</div></div>`

const rows = [['1', 'A task arrives', 'your prompt'], ['2', 'Ask Jev: which model, which effort?', `~${q(0.5)} ms`], ['3', 'Is the prompt cache warm?', 'stay put unless Jev is sure'], ['4', 'Run the turn on the pick', 'model + effort'], ['5', 'Show it above the prompt', 'the band']]
const howCard = `<div class=card><div class=eye>How it works</div>
<h1>Before every task, one lever. <span class=g>Then it gets out of the way.</span></h1>
<div style="border-top:1px solid #23201d">${rows.map(([n, a, b], i) => `<div style="display:flex;align-items:center;padding:19px 4px;border-bottom:1px solid #23201d;font-size:18px"><span style="width:56px;color:${i === 4 ? '#7dd3fc' : '#8c8478'};font-weight:${i === 4 ? 800 : 400}">${n}</span><span style="flex:1;font-weight:${i === 4 ? 700 : 400}">${a}</span><span style="font-size:14px;color:#8c8478">${b}</span></div>`).join('')}</div>
<div class=foot>Jev slow or unreachable? Your session model keeps working and you get one polite message. Subagents are never rerouted.</div></div>`

const seg = (t, c, b) => `<span style="color:${c};${b ? 'font-weight:800' : ''}">${t}</span>`
const sep = seg('  │  ', '#475569')
const bandCard = `<div class=card><div class=eye>The band</div>
<h1>What it picked, <span class=g>right above your prompt</span>.</h1>
<div style="background:#0a0908;border:1px solid #23201d;border-radius:16px;padding:22px 22px 18px;font-size:12.4px;line-height:2;white-space:pre;overflow:hidden">${seg('◆ JEV ', '#c084fc', 1)}${seg('▏balanced▕  ', '#94a3b8')}${seg('sonnet ▂▄__', '#60a5fa', 1)}${sep}${seg('medium ▰▰▱▱▱', '#38bdf8')}${sep}${seg('conf ▮▮▮▮▯ 88%', '#4ade80')}${sep}${seg('cache 🔒 warm 42k', '#4ade80')}
<span class=muted>&gt; </span><span style="color:#f0e8dc">fix the time zone bug in the date picker</span><span style="background:#f0e8dc;color:#f0e8dc">_</span></div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:22px;font-size:13.5px">
${[['#4ade80', 'haiku', 'trivial'], ['#60a5fa', 'sonnet', 'standard'], ['#c084fc', 'opus', 'hard'], ['#fbbf24', 'fable', 'hardest']].map(([c, n, d]) => `<div style="border:1px solid #23201d;border-radius:14px;padding:14px"><div style="color:${c};font-weight:800;font-size:16px">${n}</div><div class=muted>${d}</div></div>`).join('')}</div>
<div class=foot>The mark spins while a task runs. Confidence turns amber under 70% and red under 50%.</div></div>`

const eg = [['rename usr to user', 'haiku', 'low', '#4ade80'], ['add /health endpoint + test', 'sonnet', 'medium', '#60a5fa'], ['double-charge root cause', 'opus', 'xhigh', '#c084fc'], ['fix typo in README', 'haiku', 'low', '#4ade80'], ['migrate auth to JWT', 'opus', 'xhigh', '#c084fc'], ['bump version', 'haiku', 'low', '#4ade80']]
const noise = cases.map(c => c.text).join('   ·   ').repeat(3)
const hero = `<div style="width:880px;height:495px;position:relative;background:#0e0d0c;overflow:hidden">
<div style="position:absolute;left:22px;top:20px;font-size:11px;color:#8c8478">~/jev-router</div>
<div style="position:absolute;left:22px;top:44px;width:430px;font-size:9.4px;line-height:1.55;color:#3a342e;word-break:break-all;height:392px;overflow:hidden">${noise}</div>
<div style="position:absolute;left:46px;top:150px;width:380px;font-size:12.5px;line-height:2.15;background:#0e0d0ccc;padding:16px 18px;border-radius:14px;border:1px solid #23201d">
${eg.map(([t, m, e, c]) => `<div style="display:flex;gap:8px;white-space:nowrap"><span class=muted>&gt;</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis">${t}</span><span style="color:${c};font-weight:800;width:54px">${m}</span><span class=muted style="width:50px">${e}</span></div>`).join('')}</div>
<img src="${logo}" style="position:absolute;left:46px;top:68px;width:64px;height:64px;border-radius:50%;border:2px solid #23201d">
<div style="position:absolute;left:480px;top:70px;right:30px">
<div style="font-size:12px;letter-spacing:.3em;color:#8c8478"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#c4b5fd;margin-right:8px"></span>CLAUDE CODE MOD</div>
<div style="font-size:60px;font-weight:800;line-height:1.05;margin-top:16px;letter-spacing:-.02em">jev-<span class=g>router</span></div>
<div style="font-size:19px;margin-top:14px;color:#e6dccb">Right model. Right effort.<br>Every task.</div>
<div style="display:flex;gap:22px;margin-top:30px">
${[[`-${100 - pctOpus('trivial', 'cheap')}%`, 'cost, trivial'], [`-${100 - pctOpus('standard', 'balanced')}%`, 'cost, standard'], [`${q(0.5)}ms`, 'per pick'], ['4', 'models']].map(([v, l]) => `<div><div style="font-size:26px;font-weight:800">${v}</div><div class=muted style="font-size:11.5px;margin-top:2px">${l}</div></div>`).join('')}</div>
<div style="margin-top:30px;font-size:15px"><i class=muted>And yet</i> <b style="font-size:22px" class=g>hard tasks cost more.</b></div>
<div style="font-size:12.5px;margin-top:6px;color:#8c8478">Jev buys deeper reasoning there.<br>Only cheap mode is cheaper overall.</div></div>
<div style="position:absolute;left:0;right:0;bottom:0;padding:12px 30px 16px;background:#0e0d0c;font-size:11px;color:#8c8478">30 tasks, 270 Jev calls, 131 real runs. Opus 5.5, Sonnet 5.5, Haiku 5.5. Measures spend, not answer quality.</div></div>`

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
await shoot(howCard, 'how.png', 880); await shoot(bandCard, 'band.png', 880)
await browser.close()
