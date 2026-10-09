import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Cache, Decision, Effort, EffortCap, Mode, Pending, Savings, Sticky } from '../types'

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
const MODES: readonly Mode[] = ['efficient', 'balanced', 'cheap']
const STICKY: readonly Sticky[] = ['off', 'auto', 'strict']
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']
const CAPS: readonly EffortCap[] = [...EFFORTS, 'none']

// weight: relative price per token, the multipliers the `about` lines state (fable has none, 10 is an assumption).
const CLAUDE: Record<string, { id: string; about: string; weight: number }> = {
  haiku: {
    id: 'claude-haiku-5-5',
    weight: 1,
    about: 'Claude Haiku: fastest and cheapest (~1x). Simple edits, renames, lookups, short answers, boilerplate.',
  },
  sonnet: {
    id: 'claude-sonnet-5-5',
    weight: 3,
    about: 'Claude Sonnet: strong general coding at mid cost (~3x). Features, refactors, tests, normal debugging.',
  },
  opus: {
    id: 'claude-opus-5-5',
    weight: 5,
    about: 'Claude Opus: top reasoning at high cost (~5x). Hard debugging, architecture, large multi-file changes.',
  },
  fable: {
    id: 'claude-fable-5-1',
    weight: 10,
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
const pendingAtom = atom({ ...S, key: 'pending' } as const, null)
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
  pauseMs: number
  routeSteps: boolean
  routeSubagents: boolean
  baseline: string
  minConfidence: number
  minContextTokens: number
  cacheTtlMs: number
}
type Picked = Omit<Decision, 'turnId'>

// Estimated model-price units of one step: tokens as Anthropic bills them (cache reads 0.1x, cache writes 1.25x,
// output 5x input) times the model's weight. Relative, not dollars, and blind to effort.
type StepUsage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
export const stepUnits = (u: StepUsage, alias: string) =>
  ((u.input_tokens + 1.25 * u.cache_creation_input_tokens + 0.1 * u.cache_read_input_tokens + 5 * u.output_tokens) * CLAUDE[alias]!.weight) / 1000

export const savingsLine = (t: Savings) =>
  t.actual === 0 ? 'no steps measured yet' : `est. ${Math.round((1 - t.actual / t.baseline) * 100)}% vs always ${t.name} over ${t.steps} steps (model price only; effort not compared)`

let totals: Savings | null = null // loaded from the store once, then kept in memory

// Cheapest to dearest (CLAUDE's key order); a switch up this ladder is an upgrade.
const RANK = Object.keys(CLAUDE)
const aliasOf = (model: string) => Object.keys(CLAUDE).find(a => CLAUDE[a]!.id === model)

// Jev's effort drives token use more than its model pick does, so it is capped.
// `capped` is what Jev wanted when the cap lowered it.
export function capEffort(effort: Effort, cap: EffortCap): { effort: Effort; capped?: Effort } {
  if (cap === 'none' || EFFORTS.indexOf(effort) <= EFFORTS.indexOf(cap)) return { effort }
  return { effort: cap, capped: effort }
}

// Markers at the start of a prompt apply to that prompt only and are stripped before the model reads it:
// !full lifts the effort cap, !<model> pins the model (no Jev call), !cheap and !efficient pick the routing mode.
export function markers(text: string, pool: readonly string[]): { text: string; pending: Pending | null } {
  const pending: Pending = {}
  for (let m; (m = /^\s*!(full|cheap|efficient|[a-z]+)\b[ \t]*/i.exec(text)); ) {
    const w = m[1]!.toLowerCase()
    if (w === 'full') pending.full = true
    else if (w === 'cheap' || w === 'efficient') pending.mode = w
    else if (pool.includes(w)) pending.pin = w
    else break
    text = text.slice(m[0].length)
  }

  return { text, pending: Object.keys(pending).length ? pending : null }
}

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
export const segments = (mode: Mode, last: Decision | null, frame: number | null = null, cache: string | null = null, paused = false): Seg[] => {
  const head: Seg[] = [
    frame === null
      ? { text: '◆ JEV ', color: '#c084fc', bold: true }
      : { text: `${SPIN[frame % SPIN.length]} JEV `, color: GLOW[frame % GLOW.length], bold: true }, { text: `▏${mode}▕  `, color: '#94a3b8' },
  ]
  const warn: Seg[] = paused ? [{ text: '⚠ Jev paused  ', color: '#fbbf24', bold: true }] : []
  if (!last) return [...head, ...warn, { text: 'waiting for the first task', color: '#64748b' }]
  const model: Seg = last.kept
    ? { text: `${last.alias} (kept 🔒 cache warm; wanted ${last.kept})`, color: '#fbbf24' }
    : { text: `${tier(last.alias)}${last.pinned ? ' 📌' : ''}`, color: TIER_COLOR[last.alias], bold: true }
  const sep: Seg = { text: '  │  ', color: '#475569' }
  return [
    ...head,
    ...warn,
    model,
    sep,
    { text: `${last.effort} ${effortBar(last.effort)}${last.capped ? ` ⤓${last.capped}` : ''}${last.unlocked ? ' 🔓' : ''}`, color: last.unlocked ? '#fbbf24' : '#38bdf8' },
    sep,
    { text: `conf ${gauge(last.confidence)} ${Math.round(last.confidence * 100)}%`, color: confColor(last.confidence) },
    ...(cache ? [sep, { text: cache, color: cache.includes('warm') ? '#4ade80' : '#64748b' }] : []),
  ]
}

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

// Circuit breaker: with a call per step, a slow Jev would cost timeoutMs on every step.
// Three failures in a row pause Jev for pauseMs; the last pick keeps running meanwhile.
let fails = 0
let pausedUntil = 0
export const isPaused = (now: number) => now < pausedUntil

async function ask($: EngineInterface, cfg: Config, key: string, state: string, mode: Mode) {
  const now = await $.clock.now()
  if (isPaused(now)) throw new Error(`paused for ${Math.ceil((pausedUntil - now) / 1000)} s after repeated failures`)
  try {
    const picked = await askJev($, cfg, key, state, mode)
    fails = 0

    return picked
  } catch (err) {
    if (++fails >= 3) {
      fails = 0
      pausedUntil = now + cfg.pauseMs
      $.ui.toast(`Jev failed 3 times in a row (${(err as Error).message}); paused for ${cfg.pauseMs / 1000} s, using the current model`)
    }
    throw err
  }
}

let skipNext = false // the next turn is a background notification, not a task of the user's
let task = '' // the prompt the current task started with, for re-routing its later steps
const agents = new Map<string, Promise<Picked | null>>()

async function decideFor($: EngineInterface, cfg: Config, kind: string, key: string, state: string, mode: Mode, cache: Cache | null, now: number, cap: EffortCap) {
  const asked = await ask($, cfg, key, state, mode)
  const picked = decide(asked, cache, now, cfg, (await read($, stickyAtom)) ?? cfg.defaultSticky)
  const d = { ...picked, ...capEffort(picked.effort, cap) }
  $.ui.log(`jev ${kind}: ${d.alias}/${d.effort}${d.kept ? ` (kept, wanted ${d.kept})` : ''}${d.capped ? ` (capped from ${d.capped})` : ''} conf ${d.confidence.toFixed(2)} ${(await $.clock.now()) - now} ms`, { to: 'debug' })

  return d
}

// Before every step after the first, ask again: the task may have turned easier or harder.
// Failures keep the last pick quietly; the task's own first call already warned.
async function restep($: EngineInterface, cfg: Config, e: { turnId: string; index: number }, last: Decision): Promise<Decision> {
  const auth = await resolveKey($, cfg)
  if (!auth || last.pinned) return last
  try {
    const mode = await currentMode($, cfg)
    const now = await $.clock.now()
    const cache = await read($, cacheAtom)
    // strict never switches while the cache is warm, so asking could not change the pick
    if (((await read($, stickyAtom)) ?? cfg.defaultSticky) === 'strict' && isWarm(cache, now, cfg)) return last
    const text = `${task}\n\n[Routing step ${e.index + 1} of this task. The recent messages above show its progress.]`
    const cap = last.unlocked ? 'none' : (await read($, capAtom)) ?? cfg.defaultCap
    const d = await decideFor($, cfg, `step ${e.index + 1}`, auth.key, await buildState($, text, mode, cache, now, cfg), mode, cache, now, cap)
    const next: Decision = { ...d, turnId: last.turnId, unlocked: last.unlocked }
    await update($, lastAtom, () => next)

    return next
  } catch {
    return last
  }
}

// A subagent has its own context, so it is routed once, from what the Agent call said it is for.
async function routeAgent($: EngineInterface, cfg: Config, id: string, current: string): Promise<Picked | null> {
  const auth = await resolveKey($, cfg)
  const info = (await $.agent.list()).find(a => a.id === id)
  if (!auth || !info?.description) return null
  try {
    const now = await $.clock.now()
    const mode = await currentMode($, cfg)
    const cap = (await read($, lastAtom))?.unlocked ? 'none' : (await read($, capAtom)) ?? cfg.defaultCap
    const state = composeState(`Subagent task (${info.type}): ${info.description}`, mode, current, '', null, now, cfg)

    return await decideFor($, cfg, `agent ${info.type}: ${info.description}`, auth.key, state, mode, null, now, cap)
  } catch {
    return null
  }
}

// Add one step to the running totals (kept across sessions in the plugin store).
async function record($: EngineInterface, cfg: Config, u: (StepUsage & { model: string }) | undefined) {
  const alias = u && aliasOf(u.model)
  if (!u || !alias) return
  totals ??= ((await $.store.get('savings')) as Savings | undefined) ?? { actual: 0, baseline: 0, steps: 0, name: cfg.baseline }
  if (totals.name !== cfg.baseline) totals = { actual: 0, baseline: 0, steps: 0, name: cfg.baseline } // a new baseline starts a new tally
  totals.actual += stepUnits(u, alias)
  totals.baseline += stepUnits(u, cfg.baseline)
  totals.steps++
  await $.store.set('savings', totals)
}

const usage = (cmd: string, list: readonly string[]) => ({ text: `Usage: /jev ${cmd} ${list.join(' | ')}` })
const applied = (name: string, v: string) => ({ text: `Jev ${name}: ${v}. Applies from the next task.` })

export const register: Register = (on, options) => {
  const apiKey = String(options.apiKey ?? '')
  const timeoutMs = Number(options.timeoutMs ?? 4000)
  const allowed = (Array.isArray(options.models) ? options.models : Object.keys(CLAUDE))
    .map(m => String(m).toLowerCase())
    .filter(m => m in CLAUDE)
  const defaultMode: Mode = MODES.includes(options.mode as Mode) ? (options.mode as Mode) : 'balanced'

  const defaultSticky: Sticky = STICKY.includes(options.stickiness as Sticky) ? (options.stickiness as Sticky) : 'auto'
  const defaultCap: EffortCap = CAPS.includes(options.effortCap as EffortCap) ? (options.effortCap as EffortCap) : 'high'
  const flag = (v: unknown, d: boolean) => (v === undefined || v === '' ? d : String(v) !== 'false')
  const num = (v: unknown, d: number) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d)

  const cfg: Config = {
    apiKey,
    timeoutMs,
    pool: allowed.length > 0 ? allowed : Object.keys(CLAUDE),
    defaultMode,
    defaultSticky,
    defaultCap,
    pauseMs: num(options.pauseMs, 60_000),
    routeSteps: flag(options.routeSteps, true),
    routeSubagents: flag(options.routeSubagents, true),
    baseline: String(options.baselineModel ?? 'opus') in CLAUDE ? String(options.baselineModel ?? 'opus') : 'opus',
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
    let ticks = 0 // self-cancel: a prompt that never reaches turn.complete must not tick forever
    const t = $.clock.every(120, () => (++ticks > 5000 ? t.cancel() : update($, frameAtom, n => n + 1)))
    ticker = t
    skipNext = e.origin?.kind === 'task-notification'
    const m = markers(e.text, cfg.pool)
    if (!m.pending || m.text.trim() === '') return next(e)
    await update($, pendingAtom, () => m.pending)

    return next({ ...e, text: m.text })
  })

  on('turn.complete', async ($, e, next) => {
    stop()
    return next(e)
  })

  on('command.run', { command: 'jev' }, async ($, e, next) => {
    stop() // a /jev command is not a task: no spinner
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const segs: Seg[] = (await read($, enabledAtom))
      ? segments(await currentMode($, cfg), await read($, lastAtom), e.props.isWorking ? await read($, frameAtom) : null, await cacheLabel($, cfg), isPaused(await $.clock.now()))
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
    agents.clear()
    await $.command.register({
      name: 'jev',
      description: 'Jev model routing (prompt markers: !full !haiku !sonnet !opus !fable !cheap !efficient): efficient | balanced | cheap | sticky <off|auto|strict> | cap <effort|none> | full | on | off | status | key <key>',
    })

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // A continuation, or a background notification, keeps the decision of the task it continues.
    if (!(await read($, enabledAtom)) || e.text.trim() === '' || skipNext) return next(e)
    task = e.text
    const auth = await resolveKey($, cfg)
    if (!auth) {
      if (!(await read($, warnedAtom))) {
        await update($, warnedAtom, () => true)
        $.ui.toast('Jev: no TypeSafe API key. Run /jev key <key> or set TYPESAFE_API_KEY')
      }
      return next(e)
    }

    const pending = await read($, pendingAtom)
    if (pending) await update($, pendingAtom, () => null) // one prompt only
    const unlocked = pending?.full === true
    const mode = pending?.mode ?? (await currentMode($, cfg))
    try {
      const cache = await read($, cacheAtom)
      const now = await $.clock.now()
      const cap = unlocked ? 'none' : (await read($, capAtom)) ?? cfg.defaultCap
      // A pinned model skips Jev; its effort is the cap (high by default).
      const picked = pending?.pin
        ? { alias: pending.pin, model: CLAUDE[pending.pin]!.id, effort: cap === 'none' ? 'high' : cap, confidence: 1, pinned: true }
        : await decideFor($, cfg, 'prompt', auth.key, await buildState($, e.text, mode, cache, now, cfg), mode, cache, now, cap)
      const decision: Decision = { turnId: e.turnId, ...picked, unlocked }
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
    if (!(await read($, enabledAtom))) return yield* next(e)
    if (e.agentId !== undefined) {
      if (!cfg.routeSubagents) return yield* next(e)
      const id = e.agentId
      const pick = await (agents.get(id) ?? agents.set(id, routeAgent($, cfg, id, e.model)).get(id)!)

      const res = yield* next(pick ? { ...e, model: pick.model, effort: pick.effort } : e)
      await record($, cfg, res.usage)

      return res
    }
    const prev = await read($, lastAtom)
    const last = cfg.routeSteps && e.index > 0 && prev ? await restep($, cfg, e, prev) : prev

    // A model that takes no effort setting is sent none, whatever is asked.
    const res = yield* next(last ? { ...e, model: last.model, effort: last.effort } : e)

    // Remember what the API actually cached, so the next turn can protect it.
    const u = res.usage
    if (u) {
      const contextTokens = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens + u.output_tokens
      const at = await $.clock.now()
      await update($, cacheAtom, () => ({ model: u.model, at, contextTokens }))
    }
    await record($, cfg, res.usage)
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
      if (!STICKY.includes(v as Sticky)) return usage('sticky', STICKY)
      await update($, stickyAtom, () => v as Sticky)
      return applied('cache stickiness', v)
    }
    if (arg === 'stats clear') {
      totals = null
      await $.store.delete('savings')
      return { text: 'Jev savings tally cleared.' }
    }
    if (arg === 'full') {
      await update($, pendingAtom, p => ({ ...p, full: true }))
      return { text: 'Jev: the next prompt runs with the effort cap lifted.' }
    }
    if (arg.startsWith('cap')) {
      const v = arg.slice(3).trim()
      if (!CAPS.includes(v as EffortCap)) return usage('cap', CAPS)
      await update($, capAtom, () => v as EffortCap)
      return applied('effort cap', v)
    }
    if (arg === 'on' || arg === 'off') {
      await update($, enabledAtom, () => arg === 'on')
      if (arg === 'off') await update($, lastAtom, () => null)
      return { text: `Jev routing ${arg === 'on' ? 'enabled' : 'disabled; the session model is used'}.` }
    }
    if (arg === 'key' || arg.startsWith('key ')) {
      const key = e.args.trim().slice(3).trim()
      if (key === '') return { text: 'Usage: /jev key <TypeSafe API key>   or   /jev key clear' }
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
          ['pool', cfg.pool.join(' · ')],
          ['sticky', `${(await read($, stickyAtom)) ?? cfg.defaultSticky}   cache ${warm ? '● warm' : '○ cold'}`],
          ['cap', `${(await read($, capAtom)) ?? cfg.defaultCap}${(await read($, pendingAtom)) ? '   🔓 next prompt: overrides set' : ''}`],
          ['last', last ? `${last.alias} / ${last.effort}  ${gauge(last.confidence)} ${last.confidence.toFixed(2)}${last.kept ? `  kept (wanted ${last.kept})` : ''}${last.capped ? `  capped from ${last.capped}` : ''}` : 'none yet'],
          ...usageRows(await read($, statsAtom), cfg.pool),
          ['saved', savingsLine(totals ?? ((await $.store.get('savings')) as Savings | undefined) ?? { actual: 0, baseline: 0, steps: 0, name: cfg.baseline })],
          ['jev', isPaused(await $.clock.now()) ? `⚠ paused ${Math.ceil((pausedUntil - (await $.clock.now())) / 1000)} s` : '● ok'],
          ['key', auth ? `…${auth.key.slice(-4)}  (${auth.source})` : 'none: /jev key <key>'],
        ]),
      }
    }
    return { text: `Unknown option "${arg}". Use: /jev efficient | balanced | cheap | sticky <mode> | cap <effort|none> | full | on | off | status | key <key>` }
  })
}
