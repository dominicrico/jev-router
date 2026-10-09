// Renders assets/band.gif: one slow slide per state the band can be in, each with a caption.
// usage (needs ImageMagick `magick`): PW_DIR=/path/with/playwright-core CHROME=/path/to/chrome node assets/src/gif.mjs
import { createRequire } from 'node:module'
import { mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core')
const W = 880, HOLD = 260, SPIN_MS = 55 // centiseconds: 2.6 s per state, the spinner steps every 0.55 s

// Same palette as make.mjs and the same tables as hooks/register.tsx.
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const GLOW = ['#c084fc', '#a78bfa', '#818cf8', '#60a5fa', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa']
const TIER = { haiku: '#4ade80', sonnet: '#60a5fa', opus: '#c084fc', fable: '#fbbf24' }
const RANK = ['haiku', 'sonnet', 'opus', 'fable']
const EFF = ['low', 'medium', 'high', 'xhigh', 'max']
const bar = (n, on, off, len) => on.repeat(Math.round(n * len)) + off.repeat(len - Math.round(n * len))
const seg = (t, c, b) => `<span style="color:${c};${b ? 'font-weight:800' : ''}">${t}</span>`
const sep = seg('  │  ', '#475569')

// o: { mode, model, effort, conf, cache, spin (frame index), capped, unlocked, kept, pinned, escalated, paused, off, none }
const band = o => {
  if (o.off) return seg('JEV ▏off▕', '#64748b')
  const head = (o.spin === undefined ? seg('◆ JEV ', '#c084fc', 1) : seg(`${SPIN[o.spin % SPIN.length]} JEV `, GLOW[o.spin % GLOW.length], 1)) + seg(`▏${o.mode ?? 'balanced'}▕  `, '#94a3b8')
  const warn = o.paused ? seg('⚠ Jev paused  ', '#fbbf24', 1) : ''
  if (o.none) return head + warn + seg('waiting for the first task', '#64748b')
  const tier = `${o.model} ${'▂▄▆█'.slice(0, RANK.indexOf(o.model) + 1).padEnd(4, '_')}`
  const model = o.kept
    ? seg(`${o.model} (kept 🔒 cache warm; wanted ${o.kept})`, '#fbbf24')
    : seg(`${tier}${o.pinned ? ' 📌' : ''}${o.escalated ? ' ↑' : ''}`, TIER[o.model], 1)
  const eff = seg(`${o.effort} ${bar((EFF.indexOf(o.effort) + 1) / 5, '▰', '▱', 5)}${o.capped ? ` ⤓${o.capped}` : ''}${o.unlocked ? ' 🔓' : ''}`, o.unlocked ? '#fbbf24' : '#38bdf8')
  const cc = o.conf >= 0.7 ? '#4ade80' : o.conf >= 0.5 ? '#fbbf24' : '#f87171'
  const conf = seg(`conf ${bar(o.conf, '▮', '▯', 5)} ${Math.round(o.conf * 100)}%`, cc)
  const cache = seg(o.cache, o.cache.includes('warm') ? '#4ade80' : '#64748b')
  return head + warn + model + sep + eff + sep + conf + sep + cache
}

const base = { model: 'sonnet', effort: 'medium', conf: 0.88, cache: 'cache 🔒 warm 42k' }
// [caption, band options, how many frames, delay in centiseconds per frame]
const STATES = [
  ['Idle, before the first task', { none: true }],
  ['A task is running: the spinner turns and the label glows', { ...base, spin: 0 }, 4],
  ['Routed to haiku for a small task', { ...base, model: 'haiku', effort: 'low', conf: 0.93, cache: 'cache 🔒 warm 12k' }],
  ['Sonnet at medium effort for ordinary work', base],
  ['Hard task: opus, with the effort capped from xhigh', { ...base, model: 'opus', effort: 'high', capped: 'xhigh', conf: 0.81 }],
  ['Prompt starts with !full: the cap is lifted for that prompt only', { ...base, model: 'opus', effort: 'xhigh', unlocked: true, conf: 0.81 }],
  ['Cache is warm: Jev wanted haiku, the band stays on sonnet', { ...base, kept: 'haiku', conf: 0.64 }],
  ['Prompt starts with !opus: the model is pinned, no Jev call', { ...base, model: 'opus', effort: 'high', pinned: true, conf: 1 }],
  ['Three failed tool calls in a row: the task moved up one model', { ...base, model: 'opus', effort: 'medium', escalated: true }],
  ['Jev is unsure: confidence turns amber, then red below 50%', { ...base, conf: 0.55 }],
  ['Cold cache and cheap mode', { ...base, mode: 'cheap', model: 'haiku', effort: 'low', conf: 0.74, cache: 'cache cold 12k' }],
  ['Jev failed three times: paused for a minute, session model keeps working', { ...base, paused: true, conf: 0.4 }],
  ['Routing switched off with /jev off', { off: true }],
]

const html = (cap, n, total, b) => `<!doctype html><meta charset=utf8><style>
*{box-sizing:border-box;margin:0}
body{width:${W}px;background:#0b1020;padding:20px 22px 22px;font-family:-apple-system,'SF Pro Text',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.cap{display:flex;justify-content:space-between;font-size:14px;color:#94a3b8;margin:0 2px 14px}
.cap b{color:#5eead4;font-weight:600}
.band{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;background:#070b17;border:1px solid #1e293b;border-radius:16px;padding:22px 18px;font-size:11px;line-height:1.7;white-space:pre;overflow:hidden}
</style><body><div class=cap><span>${cap}</span><b>${n}/${total}</b></div><div class=band>${b}</div>`

const dir = mkdtempSync(join(tmpdir(), 'jev-gif-'))
const browser = await chromium.launch({ executablePath: process.env.CHROME })
const page = await browser.newPage({ viewport: { width: W, height: 200 }, deviceScaleFactor: 2 })
const files = [], args = []
for (const [i, [cap, o, frames = 1]] of STATES.entries())
  for (let f = 0; f < frames; f++) {
    const file = join(dir, `f${String(files.length).padStart(2, '0')}.png`)
    await page.setContent(html(cap, i + 1, STATES.length, band(frames > 1 ? { ...o, spin: f * 2 } : o)))
    await page.evaluate(() => document.fonts.ready)
    await page.locator('body').screenshot({ path: file })
    files.push(file)
    args.push('-delay', String(frames > 1 ? SPIN_MS : HOLD), file)
  }
await browser.close()

// ImageMagick: the ffmpeg bundled with playwright has no gif encoder. One shared 128-colour palette avoids flicker.
const out = join(here, '..', 'band.gif')
const pal = join(dir, 'pal.png')
execFileSync('magick', [...files, '-resize', `${W}x`, '-append', '+dither', '-colors', '128', pal])
execFileSync('magick', ['-loop', '0', ...args, '-resize', `${W}x`, '+dither', '-remap', pal, '-layers', 'OptimizePlus', out])
console.log('wrote', out, `${files.length} frames`)
