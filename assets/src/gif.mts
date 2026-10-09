// Renders assets/band.gif: one slow slide per state the band can be in, each with a caption.
// usage (needs ImageMagick `magick`, run from the repo root):
//   PW_DIR=/path/with/playwright-core CHROME=/path/to/chrome npx -y tsx --tsconfig benchmarks/tsconfig.json assets/src/gif.mts
// The tsconfig maps the 'claude-code' import in hooks/register.tsx to a stub so it loads outside Claude Code.
import { createRequire } from 'node:module'
import { mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { segments } from '../../hooks/register.tsx'
import type { Decision, Effort, Mode, Ran } from '../../types'

const here = dirname(fileURLToPath(import.meta.url))
const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core')
const W = 880, HOLD = 260, SPIN_MS = 55 // centiseconds: 2.6 s per state, the spinner steps every 0.55 s

// Each slide is built from the mod's own segments(), so the band here cannot drift from the real one.
type Seg = ReturnType<typeof segments>[number]
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const span = ({ text, color, bold }: Seg) => `<span style="color:${color};${bold ? 'font-weight:800' : ''}">${esc(text)}</span>`

// o: { mode, last (a Decision, null while idle), cache (label string), spin (frame index, null = static), paused, off }
type Band = { mode?: Mode; last?: Decision | null; cache?: string | null; spin?: number | null; paused?: boolean; off?: boolean; ran?: Ran | null }
const band = (o: Band) =>
  (o.off
    ? [{ text: 'JEV ▏off▕', color: '#64748b' }]
    : segments(o.mode ?? 'balanced', o.last ?? null, o.spin ?? null, o.cache ?? null, o.paused ?? false, o.ran ?? null)
  ).map(span).join('')

const IDS = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5', fable: 'claude-fable-5-1' }
const dec = (alias: keyof typeof IDS, effort: Effort, confidence: number, extra: Partial<Decision> = {}) =>
  ({ alias, model: IDS[alias], effort, confidence, turnId: 'gif', ...extra }) as Decision
const ranOn = (alias: keyof typeof IDS): Ran => ({ alias, model: IDS[alias], turnId: 'gif', at: 0 })
const sonnet = dec('sonnet', 'medium', 0.88)
const warm = 'cache 🔒 warm 42k'
// [caption, band options, how many frames, delay in centiseconds per frame]
const STATES: [string, Band, number?][] = [
  ['Idle, before the first task', {}],
  ['A task is running: the spinner turns and the label glows', { last: sonnet, cache: warm, spin: 0 }, 4],
  ['Routed to haiku for a small task', { last: dec('haiku', 'low', 0.93), cache: 'cache 🔒 warm 12k' }],
  ['Sonnet at medium effort for ordinary work', { last: sonnet, cache: warm }],
  ['Hard task: opus, with the effort capped from xhigh', { last: dec('opus', 'high', 0.81, { capped: 'xhigh' }), cache: warm }],
  ['Prompt starts with !full: the cap is lifted for that prompt only', { last: dec('opus', 'xhigh', 0.81, { unlocked: true }), cache: warm }],
  ['Opus was picked but the session ran on sonnet (a /model switch or a fallback): the band tells you', { last: dec('opus', 'high', 0.81), ran: ranOn('sonnet'), cache: warm }],
  ['Jev failed, so there is no pick: the band shows the model that is really running', { ran: ranOn('sonnet'), cache: warm }],
  ['A ceiling at sonnet stopped an opus pick (Jev was under 90% sure)', { last: dec('sonnet', 'high', 0.7, { clamped: 'opus' }), cache: warm }],
  ['Cache is warm: Jev wanted haiku, the band stays on sonnet', { last: dec('sonnet', 'medium', 0.64, { kept: 'haiku' }), cache: warm }],
  ['Prompt starts with !opus: the model is pinned, no Jev call', { last: dec('opus', 'high', 1, { pinned: true }), cache: warm }],
  ['Three failed tool calls in a row: the task moved up one model', { last: dec('opus', 'medium', 0.88, { escalated: true }), cache: warm }],
  ['Jev is unsure: confidence turns amber, then red below 50%', { last: dec('sonnet', 'medium', 0.55), cache: warm }],
  ['Cold cache and cheap mode', { mode: 'cheap', last: dec('haiku', 'low', 0.74), cache: 'cache cold 12k' }],
  ['Jev failed three times: paused for a minute, session model keeps working', { last: dec('sonnet', 'medium', 0.4), cache: warm, paused: true }],
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
