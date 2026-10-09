// Renders the band spinner as assets/band.gif: 12 frames, 120 ms each.
// usage (needs ImageMagick `magick`): PW_DIR=/path/with/playwright-core CHROME=/path/to/chrome node assets/src/gif.mjs
import { createRequire } from 'node:module'
import { mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core')

// Same palette as make.mjs (band card) and the same arrays as hooks/register.tsx.
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const GLOW = ['#c084fc', '#a78bfa', '#818cf8', '#60a5fa', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa']
const FRAMES = 12, MS = 120, W = 880

const seg = (t, c, b) => `<span style="color:${c};${b ? 'font-weight:800' : ''}">${t}</span>`
const sep = seg('  │  ', '#475569')
const line = i =>
  seg(`${SPIN[i % SPIN.length]} JEV `, GLOW[i % GLOW.length], 1) + seg('▏balanced▕  ', '#94a3b8') + seg('sonnet ▂▄__', '#60a5fa', 1) + sep +
  seg('high ▰▰▰▱▱ ⤓xhigh', '#38bdf8') + sep + seg('conf ▮▮▮▮▯ 88%', '#4ade80') + sep + seg('cache 🔒 warm 42k', '#4ade80')

const html = i => `<!doctype html><meta charset=utf8><style>
*{box-sizing:border-box;margin:0}
body{width:${W}px;background:#0b1020;padding:24px 22px;font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;-webkit-font-smoothing:antialiased}
.band{background:#070b17;border:1px solid #1e293b;border-radius:16px;padding:22px 22px;font-size:13.4px;line-height:1.6;white-space:pre;overflow:hidden}
</style><body><div class=band>${line(i)}</div>`

const dir = mkdtempSync(join(tmpdir(), 'jev-gif-'))
const browser = await chromium.launch({ executablePath: process.env.CHROME })
const page = await browser.newPage({ viewport: { width: W, height: 200 }, deviceScaleFactor: 2 })
for (let i = 0; i < FRAMES; i++) {
  await page.setContent(html(i)); await page.evaluate(() => document.fonts.ready)
  await page.locator('body').screenshot({ path: join(dir, `f${String(i).padStart(2, '0')}.png`) })
}
await browser.close()

// Assemble with ImageMagick: the ffmpeg bundled with playwright has no gif encoder or palette filters.
// One shared 64-colour palette keeps the frames from flickering and the file small.
const out = join(here, '..', 'band.gif')
const frames = Array.from({ length: FRAMES }, (_, i) => join(dir, `f${String(i).padStart(2, '0')}.png`))
const pal = join(dir, 'pal.png')
execFileSync('magick', [...frames, '-resize', `${W}x`, '+append', '+dither', '-colors', '64', pal])
execFileSync('magick', ['-delay', String(MS / 10), '-loop', '0', ...frames, '-resize', `${W}x`, '+dither', '-remap', pal, '-layers', 'OptimizePlus', out])
console.log('wrote', out)
