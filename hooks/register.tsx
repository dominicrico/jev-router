import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Cache, Decision, Effort, EffortCap, Mode, Sticky } from '../types'

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
const MODES: readonly Mode[] = ['efficient', 'balanced', 'cheap']
const STICKY: readonly Sticky[] = ['off', 'auto', 'strict']
const CAPS: readonly EffortCap[] = ['low', 'medium', 'high', 'xhigh', 'max', 'none']
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

const CLAUDE: Record<string, { id: string; about: string }> = {
  haiku: {
    id: 'claude-haiku-5-5',
    about: 'Claude Haiku: fastest and cheapest (~1x). Simple edits, renames, lookups, short answers, boilerplate.',
  },
  sonnet: {
    id: 'claude-sonnet-5-5',
    about: 'Claude Sonnet: strong general coding at mid cost (~3x). Features, refactors, tests, normal debugging.',
  },
  opus: {
    id: 'claude-opus-5-5',
    about: 'Claude Opus: top reasoning at high cost (~5x). Hard debugging, architecture, large multi-file changes.',
  },
  fable: {
    id: 'claude-fable-5-1',
    about: 'Claude Fable: most capable, highest cost. The hardest, longest, most ambiguous tasks.',
  },
}

const MODE_RULE: Record<Mode, string> = {
  efficient: 'Pick the model and effort that give the best result for this task; cost is secondary.',
  balanced: 'Weigh result quality and cost evenly; use a stronger model only when the task clearly needs it.',
  cheap: 'Pick the cheapest model and lowest effort that can plausibly succeed at this task.',
}

const EFFORT_ABOUT: Record<Effort, string> = {
  low: 'Trivial or mechanical, little thinking needed',
  medium: 'Ordinary task, some reasoning',
  high: 'Non-trivial reasoning or multi-step work',
  xhigh: 'Hard problem, careful deep reasoning',
  max: 'Extremely hard, think as long as needed',
}

const S = { plugin: 'jev-router' } as const
const modeAtom = atom({ ...S, key: 'mode' } as const, null)
const enabledAtom = atom({ ...S, key: 'enabled' } as const, true)
const lastAtom = atom({ ...S, key: 'last' } as const, null)
const cacheAtom = atom({ ...S, key: 'cache' } as const, null)
const stickyAtom = atom({ ...S, key: 'sticky' } as const, null)
const statsAtom = atom({ ...S, key: 'stats' } as const, {})
const capAtom = atom({ ...S, key: 'cap' } as const, null)
const unlockAtom = atom({ ...S, key: 'unlock' } as const, false)
const frameAtom = atom({ ...S, key: 'frame' } as const, 0)
const warnedAtom = atom({ ...S, key: 'warned' } as const, false)

type JevChoice = { choice?: string; confidence?: number }
type JevReply = { answers?: { model?: JevChoice; effort?: JevChoice } }

export type Config = {
  apiKey: string
  timeoutMs: number
  pool: string[]
  defaultMode: Mode
  defaultSticky: Sticky
  defaultCap: EffortCap
  minConfidence: number
  minContextTokens: number
  cacheTtlMs: number
}
type Picked = Omit<Decision, 'turnId'>

// Cheapest to dearest; a switch up this ladder is an upgrade.
const RANK = ['haiku', 'sonnet', 'opus', 'fable']
const aliasOf = (model: string) => Object.keys(CLAUDE).find(a => CLAUDE[a]!.id === model)

// Jev's effort drives token use more than its model pick does, so it is capped.
// `capped` is what Jev wanted when the cap lowered it.
export function capEffort(effort: Effort, cap: EffortCap): { effort: Effort; capped?: Effort } {
  if (cap === 'none' || EFFORTS.indexOf(effort) <= EFFORTS.indexOf(cap)) return { effort }
  return { effort: cap, capped: effort }
}

// A prompt that starts with this runs uncapped. The marker is stripped before the model reads it.
export const UNLOCK = /^\s*!full\b[ \t]*/i

export const isWarm = (cache: Cache | null, now: number, cfg: Config): cache is Cache =>
  cache !== null && now - cache.at <= cfg.cacheTtlMs && cache.contextTokens >= cfg.minContextTokens

// A switch discards the prompt cache. While it is warm and worth keeping, stay
// on the cached model unless Jev confidently asks for a stronger one.
export function decide(picked: Picked, cache: Cache | null, now: number, cfg: Config, sticky: Sticky): Picked {
  if (sticky === 'off' || !isWarm(cache, now, cfg) || cache.model === picked.model) return picked
  const from = aliasOf(cache.model)
  if (!from) return picked
  const upgrade = RANK.indexOf(picked.alias) > RANK.indexOf(from)
  if (sticky === 'auto' && upgrade && picked.confidence >= cfg.minConfidence) return picked
  return { ...picked, alias: from, model: cache.model, kept: picked.alias }
}

const bar = (n: number, on: string, off: string, len: number) =>
  on.repeat(Math.round(n * len)) + off.repeat(len - Math.round(n * len))
const gauge = (c: number) => bar(c, '▮', '▯', 5)
const tier = (alias: string) => `${alias} ${'▂▄▆█'.slice(0, RANK.indexOf(alias) + 1).padEnd(4, '_')}`
const effortBar = (e: Effort) => bar((EFFORTS.indexOf(e) + 1) / EFFORTS.length, '▰', '▱', 5)

const TIER_COLOR: Record<string, string> = { haiku: '#4ade80', sonnet: '#60a5fa', opus: '#c084fc', fable: '#fbbf24' }
const confColor = (c: number) => (c >= 0.7 ? '#4ade80' : c >= 0.5 ? '#fbbf24' : '#f87171')

type Seg = { text: string; color?: string; bold?: boolean }

const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const GLOW = ['#c084fc', '#a78bfa', '#818cf8', '#60a5fa', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa']

// frame is null while idle: static. While a task runs the mark spins and the label glows.
export const segments = (mode: Mode, last: Decision | null, frame: number | null = null, cache: string | null = null): Seg[] => {
  const head: Seg[] = [
    frame === null
      ? { text: '◆ JEV ', color: '#c084fc', bold: true }
      : { text: `${SPIN[frame % SPIN.length]} JEV `, color: GLOW[frame % GLOW.length], bold: true }, { text: `▏${mode}▕  `, color: '#94a3b8' },
  ]
  if (!last) return [...head, { text: 'waiting for the first task', color: '#64748b' }]
  const model: Seg = last.kept
    ? { text: `${last.alias} (kept 🔒 cache warm; wanted ${last.kept})`, color: '#fbbf24' }
    : { text: tier(last.alias), color: TIER_COLOR[last.alias], bold: true }
  const sep: Seg = { text: '  │  ', color: '#475569' }
  return [
    ...head,
    model,
    sep,
    { text: `${last.effort} ${effortBar(last.effort)}${last.capped ? ` ⤓${last.capped}` : ''}${last.unlocked ? ' 🔓' : ''}`, color: last.unlocked ? '#fbbf24' : '#38bdf8' },
    sep,
    { text: `conf ${gauge(last.confidence)} ${Math.round(last.confidence * 100)}%`, color: confColor(last.confidence) },
    ...(cache ? [sep, { text: cache, color: cache.includes('warm') ? '#4ade80' : '#64748b' }] : []),
  ]
}

export const statusLine = (mode: Mode, last: Decision | null) => segments(mode, last).map(x => x.text).join('').trimEnd()

// One row per model: tasks routed to it this session, with a share bar.
const usageRows = (stats: Record<string, number>, pool: string[]): [string, string][] => {
  const total = pool.reduce((n, m) => n + (stats[m] ?? 0), 0)
  if (!total) return [['usage', 'no tasks routed yet']]
  return pool.map((m, i): [string, string] => [
    i === 0 ? 'usage' : '',
    `${m.padEnd(7)} ${bar((stats[m] ?? 0) / total, '█', '░', 10)} ${String(stats[m] ?? 0).padStart(3)}  ${Math.round(((stats[m] ?? 0) / total) * 100)}%`,
  ])
}

function box(title: string, rows: [string, string][]) {
  const body = rows.map(([k, v]) => `${k.padEnd(8)} ${v}`)
  const w = Math.max(title.length + 3, ...body.map(l => l.length)) + 1
  return [
    `┌ ${title} ${'─'.repeat(w - title.length - 1)}┐`,
    ...body.map(l => `│ ${l.padEnd(w)}│`),
    `└${'─'.repeat(w + 1)}┘`,
  ].join('\n')
}

async function cacheLabel($: EngineInterface, cfg: Config) {
  const cache = await read($, cacheAtom)
  if (!cache) return 'cache none yet'
  const k = `${Math.round(cache.contextTokens / 1000)}k`
  return isWarm(cache, await $.clock.now(), cfg) ? `cache 🔒 warm ${k}` : `cache cold ${k}`
}

async function currentMode($: EngineInterface, cfg: Config) {
  return (await read($, modeAtom)) ?? cfg.defaultMode
}

async function buildState($: EngineInterface, text: string, mode: Mode, cache: Cache | null, now: number, cfg: Config) {
  const current = await $.session.model()
  const history = (await $.session.messages())
    .slice(-8)
    .map(m => `${m.role}: ${m.text.slice(0, 700)}`)
    .join('\n')
    .slice(-6000)

  return composeState(text, mode, current, history, cache, now, cfg)
}

// Pure, so the benchmark sends Jev exactly what the mod sends.
export function composeState(text: string, mode: Mode, current: string, history: string, cache: Cache | null, now: number, cfg: Config) {
  return [
    `Routing mode: ${mode}. ${MODE_RULE[mode]}`,
    `Current model: ${current}. Switching models discards the prompt cache, so prefer staying on it when the gain from switching is small.`,
    cache
      ? `Prompt cache: ${isWarm(cache, now, cfg) ? 'warm' : 'cold'}, ~${cache.contextTokens} tokens on ${cache.model}. Switching re-writes them.`
      : '',
    history ? `Recent conversation:\n${history}` : 'Recent conversation: (none, this is the first task)',
    `New task from the user:\n${text.slice(0, 8000)}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

// Sensitive plugin options get no /config row, so the key also comes from
// the plugin's store (`/jev key <key>`) or the TYPESAFE_API_KEY variable.
async function resolveKey($: EngineInterface, cfg: Config): Promise<{ key: string; source: string } | null> {
  if (cfg.apiKey) return { key: cfg.apiKey, source: 'plugin option' }
  const stored = await $.store.get('apiKey')
  if (typeof stored === 'string' && stored) return { key: stored, source: '/jev key' }
  const env = await $.env.get('TYPESAFE_API_KEY')
  if (env) return { key: env, source: 'TYPESAFE_API_KEY' }
  return null
}

export function jevBody(pool: string[], state: string, mode: Mode) {
  return {
    model: 'jev-latest',
    state,
    questions: {
      model: {
        type: 'choice',
        instructions: `Which Claude model should handle the new coding task? ${MODE_RULE[mode]}`,
        criteria: Object.fromEntries(pool.map(m => [m, CLAUDE[m]!.about])),
      },
      effort: {
        type: 'choice',
        instructions: `How much reasoning effort does the new task need? ${MODE_RULE[mode]}`,
        criteria: Object.fromEntries(EFFORTS.map(x => [x, EFFORT_ABOUT[x]])),
      },
    },
  }
}

async function askJev($: EngineInterface, cfg: Config, key: string, state: string, mode: Mode) {
  const body = jevBody(cfg.pool, state, mode)
  const call = $.http.fetch(JEV_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  })
  const timeout = $.clock.sleep(cfg.timeoutMs).then(() => {
    throw new Error(`timed out after ${cfg.timeoutMs} ms`)
  })
  const res = await Promise.race([call, timeout])
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const reply = JSON.parse(res.text) as JevReply
  const alias = reply.answers?.model?.choice
  const effort = reply.answers?.effort?.choice as Effort | undefined
  if (!alias || !cfg.pool.includes(alias)) throw new Error(`unexpected model choice: ${alias}`)

  return {
    alias,
    model: CLAUDE[alias]!.id,
    effort: effort && EFFORTS.includes(effort) ? effort : 'medium',
    confidence: reply.answers?.model?.confidence ?? 0,
  }
}


export const register: Register = (on, options) => {
  const apiKey = String(options.apiKey ?? '')
  const timeoutMs = Number(options.timeoutMs ?? 4000)
  const allowed = (Array.isArray(options.models) ? options.models : Object.keys(CLAUDE))
    .map(m => String(m).toLowerCase())
    .filter(m => m in CLAUDE)
  const pool = allowed.length > 0 ? allowed : Object.keys(CLAUDE)
  const defaultMode: Mode = MODES.includes(options.mode as Mode) ? (options.mode as Mode) : 'balanced'

  const defaultSticky: Sticky = STICKY.includes(options.stickiness as Sticky) ? (options.stickiness as Sticky) : 'auto'
  const defaultCap: EffortCap = CAPS.includes(options.effortCap as EffortCap) ? (options.effortCap as EffortCap) : 'high'
  const num = (v: unknown, d: number) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d)

  const cfg: Config = {
    apiKey,
    timeoutMs,
    pool,
    defaultMode,
    defaultSticky,
    defaultCap,
    minConfidence: num(options.minConfidence, 0.7),
    minContextTokens: num(options.minContextTokens, 8000),
    cacheTtlMs: num(options.cacheTtlMs, 300_000),
  }

  // The frame ticks only while a task runs, so an idle session redraws nothing.
  let ticker: { cancel: () => void } | undefined
  const stop = () => {
    ticker?.cancel()
    ticker = undefined
  }

  on('prompt.submit', async ($, e, next) => {
    stop()
    ticker = $.clock.every(120, () => update($, frameAtom, n => n + 1))
    const m = UNLOCK.exec(e.text)
    if (!m || e.text.length === m[0].length) return next(e)
    await update($, unlockAtom, () => true)

    return next({ ...e, text: e.text.slice(m[0].length) })
  })

  on('turn.complete', async ($, e, next) => {
    stop()
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const segs: Seg[] = (await read($, enabledAtom))
      ? segments(await currentMode($, cfg), await read($, lastAtom), e.props.isWorking ? await read($, frameAtom) : null, await cacheLabel($, cfg))
      : [{ text: 'JEV ▏off▕', color: '#64748b' }]

    return (
      <Box>
        <Text>
          {segs.map(x => (
            <Text color={x.color} bold={x.bold}>
              {x.text}
            </Text>
          ))}
        </Text>
      </Box>
    )
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'jev',
      description: 'Jev model routing: efficient | balanced | cheap | sticky <off|auto|strict> | cap <effort|none> | full | on | off | status | key <key>',
    })

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // A continuation keeps the decision of the task it continues.
    if (!(await read($, enabledAtom)) || e.text.trim() === '') return next(e)
    const auth = await resolveKey($, cfg)
    if (!auth) {
      if (!(await read($, warnedAtom))) {
        await update($, warnedAtom, () => true)
        $.ui.toast('Jev: no TypeSafe API key. Run /jev key <key> or set TYPESAFE_API_KEY')
      }
      return next(e)
    }

    const mode = await currentMode($, cfg)
    const unlocked = await read($, unlockAtom)
    if (unlocked) await update($, unlockAtom, () => false) // one prompt only
    try {
      const cache = await read($, cacheAtom)
      const now = await $.clock.now()
      const asked = await askJev($, cfg, auth.key, await buildState($, e.text, mode, cache, now, cfg), mode)
      const picked = decide(asked, cache, now, cfg, (await read($, stickyAtom)) ?? cfg.defaultSticky)
      const cap = unlocked ? 'none' : (await read($, capAtom)) ?? cfg.defaultCap
      const decision: Decision = { turnId: e.turnId, ...picked, ...capEffort(picked.effort, cap), ...(unlocked ? { unlocked } : {}) }
      await update($, lastAtom, () => decision)
      await update($, statsAtom, n => ({ ...n, [decision.alias]: (n[decision.alias] ?? 0) + 1 }))
    } catch (err) {
      await update($, lastAtom, () => null)
      if (!(await read($, warnedAtom))) {
        await update($, warnedAtom, () => true)
        $.ui.toast(`Jev unavailable (${(err as Error).message}), using ${await $.session.model()}`)
      }
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined || !(await read($, enabledAtom))) return yield* next(e)
    const last = await read($, lastAtom)

    // A model that takes no effort setting is sent none, whatever is asked.
    const res = yield* next(last ? { ...e, model: last.model, effort: last.effort } : e)

    // Remember what the API actually cached, so the next turn can protect it.
    const u = res.usage
    if (u) {
      const contextTokens = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens + u.output_tokens
      const at = await $.clock.now()
      await update($, cacheAtom, () => ({ model: u.model, at, contextTokens }))
    }
    return res
  })

  on('command.run', { command: 'jev' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (MODES.includes(arg as Mode)) {
      await update($, modeAtom, () => arg as Mode)
      await update($, enabledAtom, () => true)
      return { text: `Jev routing mode: ${arg}. Applies from the next task.` }
    }
    if (arg.startsWith('sticky')) {
      const v = arg.slice(6).trim()
      if (!STICKY.includes(v as Sticky)) return { text: 'Usage: /jev sticky off | auto | strict' }
      await update($, stickyAtom, () => v as Sticky)
      return { text: `Jev cache stickiness: ${v}. Applies from the next task.` }
    }
    if (arg === 'full') {
      await update($, unlockAtom, () => true)
      return { text: 'Jev: the next prompt runs with the effort cap lifted.' }
    }
    if (arg.startsWith('cap')) {
      const v = arg.slice(3).trim()
      if (!CAPS.includes(v as EffortCap)) return { text: 'Usage: /jev cap low | medium | high | xhigh | max | none' }
      await update($, capAtom, () => v as EffortCap)
      return { text: `Jev effort cap: ${v}. Applies from the next task. Start a prompt with !full to lift it once.` }
    }
    if (arg === 'on' || arg === 'off') {
      await update($, enabledAtom, () => arg === 'on')
      if (arg === 'off') await update($, lastAtom, () => null)
      return { text: `Jev routing ${arg === 'on' ? 'enabled' : 'disabled; the session model is used'}.` }
    }
    if (arg === 'key' || arg.startsWith('key ')) {
      const key = e.args.trim().slice(3).trim()
      if (key === '' ) return { text: 'Usage: /jev key <TypeSafe API key>   or   /jev key clear' }
      if (key === 'clear') {
        await $.store.delete('apiKey')
        return { text: 'Stored TypeSafe API key removed.' }
      }
      await $.store.set('apiKey', key)
      await update($, warnedAtom, () => false)
      return { text: `TypeSafe API key saved (…${key.slice(-4)}). Applies from the next task.` }
    }
    if (arg === '' || arg === 'status') {
      const auth = await resolveKey($, cfg)
      const enabled = await read($, enabledAtom)
      const last = await read($, lastAtom)
      const cache = await read($, cacheAtom)
      const warm = isWarm(cache, await $.clock.now(), cfg)
      return {
        text: '\n' + box('Jev router', [
          ['state', `${enabled ? '● on ' : '○ off'}   mode  ${await currentMode($, cfg)}`],
          ['pool', pool.join(' · ')],
          ['sticky', `${(await read($, stickyAtom)) ?? cfg.defaultSticky}   cache ${warm ? '● warm' : '○ cold'}`],
          ['cap', `${(await read($, capAtom)) ?? cfg.defaultCap}${(await read($, unlockAtom)) ? '   🔓 next prompt uncapped' : ''}`],
          ['last', last ? `${last.alias} / ${last.effort}  ${gauge(last.confidence)} ${last.confidence.toFixed(2)}${last.kept ? `  kept (wanted ${last.kept})` : ''}${last.capped ? `  capped from ${last.capped}` : ''}` : 'none yet'],
          ...usageRows(await read($, statsAtom), pool),
          ['key', auth ? `…${auth.key.slice(-4)}  (${auth.source})` : 'none: /jev key <key>'],
        ]),
      }
    }
    return { text: `Unknown option "${arg}". Use: /jev efficient | balanced | cheap | sticky <mode> | cap <effort|none> | full | on | off | status | key <key>` }
  })
}
