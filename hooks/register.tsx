import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Cache, Decision, Effort, EffortCap, Mode, Pending, Ran, Savings, Sticky } from '../types'

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
const capAtom = atom({ ...S, key: 'cap' } as const, null)
const ranAtom = atom({ ...S, key: 'ran' } as const, null)
const presetAtom = atom({ ...S, key: 'preset' } as const, null)
const ceilingAtom = atom({ ...S, key: 'ceiling' } as const, null)
const floorAtom = atom({ ...S, key: 'floor' } as const, null)
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
  sendHistory: boolean
  redact: boolean
  maxTaskChars: number
  fallback: 'session' | 'heuristic'
  escalateAfter: number
  ceiling: string
  floor: string
  ceilingBreak: number
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

// Named bundles of the settings that decide how much a task may cost. `balanced` is the router's plain behaviour.
export const PRESETS: Record<string, { ceiling: string; cap: EffortCap; mode: Mode }> = {
  lean: { ceiling: 'sonnet', cap: 'medium', mode: 'balanced' },
  balanced: { ceiling: 'none', cap: 'high', mode: 'balanced' },
  max: { ceiling: 'none', cap: 'none', mode: 'efficient' },
}

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

// Keeps a pick between a floor and a ceiling. Going above the ceiling needs `ceilingBreak` confidence.
// The replacement is the nearest allowed model on the right side of the limit. Pure.
export function limit(picked: Picked, ceiling: string, floor: string, ceilingBreak: number, pool: readonly string[]): Picked {
  const allowed = RANK.filter(a => pool.includes(a))
  const move = (p: Picked, to: string | undefined): Picked => (to && to !== p.alias ? { ...p, alias: to, model: CLAUDE[to]!.id, clamped: picked.alias } : p)
  let p = picked
  if (ceiling !== 'none' && RANK.indexOf(p.alias) > RANK.indexOf(ceiling) && p.confidence < ceilingBreak)
    p = move(p, [...allowed].reverse().find(a => RANK.indexOf(a) <= RANK.indexOf(ceiling)))
  if (floor !== 'none' && RANK.indexOf(p.alias) < RANK.indexOf(floor)) p = move(p, allowed.find(a => RANK.indexOf(a) >= RANK.indexOf(floor)))

  return p
}

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
// `ran` is the model the last step really used: it overrides the pick when they disagree, and stands in for it when there is no pick.
export const segments = (mode: Mode, last: Decision | null, frame: number | null = null, cache: string | null = null, paused = false, ran: Ran | null = null): Seg[] => {
  const head: Seg[] = [
    frame === null
      ? { text: '◆ JEV ', color: '#c084fc', bold: true }
      : { text: `${SPIN[frame % SPIN.length]} JEV `, color: GLOW[frame % GLOW.length], bold: true }, { text: `▏${mode}▕  `, color: '#94a3b8' },
  ]
  const warn: Seg[] = paused ? [{ text: '⚠ Jev paused  ', color: '#fbbf24', bold: true }] : []
  const sep: Seg = { text: '  │  ', color: '#475569' }
  const cacheSeg: Seg[] = cache ? [sep, { text: cache, color: cache.includes('warm') ? '#4ade80' : '#64748b' }] : []
  if (!last) {
    if (!ran) return [...head, ...warn, { text: 'waiting for the first task', color: '#64748b' }]
    return [...head, ...warn, { text: `${ran.alias} (session model)`, color: '#94a3b8' }, ...cacheSeg]
  }
  const differs = ran && ran.turnId === last.turnId && ran.model !== last.model // only within this task: a stale model from the last one is not a mismatch
  const model: Seg = last.kept
    ? { text: `${last.alias} (kept 🔒 cache warm; wanted ${last.kept})`, color: '#fbbf24' }
    : differs
      ? { text: `${ran.alias} (picked ${last.alias})`, color: '#fbbf24', bold: true }
      : { text: `${tier(last.alias)}${last.pinned ? ' 📌' : ''}${last.escalated ? ' ↑' : ''}${last.clamped ? ` ⤒${last.clamped}` : ''}`, color: TIER_COLOR[last.alias], bold: true }
  return [
    ...head,
    ...warn,
    model,
    sep,
    { text: `${last.effort} ${effortBar(last.effort)}${last.capped ? ` ⤓${last.capped}` : ''}${last.unlocked ? ' 🔓' : ''}`, color: last.unlocked ? '#fbbf24' : '#38bdf8' },
    sep,
    { text: `conf ${gauge(last.confidence)} ${Math.round(last.confidence * 100)}%`, color: confColor(last.confidence) },
    ...cacheSeg,
  ]
}

// One row per model: steps that ran on it, with a share bar.
const usageRows = (stats: Record<string, number>, pool: string[]): [string, string][] => {
  const total = pool.reduce((n, m) => n + (stats[m] ?? 0), 0)
  if (!total) return [['usage', 'no steps yet']]
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

// Secrets that must not leave the machine inside a prompt or the conversation sent to Jev.
const SECRETS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
]
// NAME=value / "name": "value" for names that read like a secret, and user:password@ in URLs.
const SECRET_NAME = /\b([\w.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|(?:private|access|signing|encryption|deploy|ssh)[_-]?key)[\w.-]*)(["']?\s*[=:]\s*["']?)(?!(?:string|number|boolean|null|undefined|true|false|any|object)\b)[^\s"',;}]{3,}/gi
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):[^\s@/]+@/gi
export const redact = (text: string) =>
  SECRETS.reduce((t, re) => t.replace(re, '[redacted]'), text).replace(SECRET_NAME, '$1$2[redacted]').replace(URL_CREDENTIALS, '$1:[redacted]@')

// Used only when Jev is down and `fallback` is 'heuristic'. ponytail: three buckets from length and a few words; real routing needs Jev.
export function heuristic(text: string, pool: readonly string[]): Picked {
  const hard = text.length > 1500 || /architect|design|migrat|root cause|concurren|race|deadlock|security|across .* (modules|services)/i.test(text)
  const easy = text.length < 200 && /rename|typo|bump|format|lint|comment|where is|what does|show me/i.test(text)
  const want = hard ? 'opus' : easy ? 'haiku' : 'sonnet'
  const alias = RANK.slice(RANK.indexOf(want)).find(a => pool.includes(a)) ?? RANK.filter(a => pool.includes(a)).pop()!

  return { alias, model: CLAUDE[alias]!.id, effort: hard ? 'high' : easy ? 'low' : 'medium', confidence: 0.3 }
}

// Pure, so the benchmark sends Jev exactly what the mod sends.
export function composeState(text: string, mode: Mode, current: string, history: string, cache: Cache | null, now: number, cfg: Config) {
  const clean = (t: string) => (cfg.redact ? redact(t) : t)

  return [
    `Routing mode: ${mode}. ${MODE_RULE[mode]}`,
    `Current model: ${current}. Switching models discards the prompt cache, so prefer staying on it when the gain from switching is small.`,
    cache
      ? `Prompt cache: ${isWarm(cache, now, cfg) ? 'warm' : 'cold'}, ~${cache.contextTokens} tokens on ${cache.model}. Switching re-writes them.`
      : '',
    history && cfg.sendHistory ? `Recent conversation:\n${clean(history)}` : 'Recent conversation: (none, this is the first task)',
    `New task from the user:\n${clean(text.slice(0, cfg.maxTaskChars))}`,
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

let coldTimer: { cancel: () => void } | undefined
let strikes = 0 // consecutive failed tool calls of the current task
let skipNext = false // the next turn is a background notification, not a task of the user's
let task = '' // the prompt the current task started with, for re-routing its later steps
const agents = new Map<string, Promise<Picked | null>>()

async function decideFor($: EngineInterface, cfg: Config, kind: string, key: string, text: string, state: string, mode: Mode, cache: Cache | null, now: number, cap: EffortCap) {
  let asked: Picked
  try {
    asked = await ask($, cfg, key, state, mode)
  } catch (err) {
    if (cfg.fallback !== 'heuristic') throw err
    asked = heuristic(text, cfg.pool)
    $.ui.log(`jev ${kind}: Jev unavailable (${(err as Error).message}), heuristic pick ${asked.alias}`, { to: 'debug' })
  }
  const limited = limit(asked, (await read($, ceilingAtom)) ?? cfg.ceiling, (await read($, floorAtom)) ?? cfg.floor, cfg.ceilingBreak, cfg.pool)
  const picked = decide(limited, cache, now, cfg, (await read($, stickyAtom)) ?? cfg.defaultSticky)
  const d = { ...picked, ...capEffort(picked.effort, cap) }
  $.ui.log(`jev ${kind}: ${d.alias}/${d.effort}${d.kept ? ` (kept, wanted ${d.kept})` : ''}${d.capped ? ` (capped from ${d.capped})` : ''}${d.clamped ? ` (clamped from ${d.clamped})` : ''} conf ${d.confidence.toFixed(2)} cache ${cache ? `${isWarm(cache, now, cfg) ? 'warm' : 'cold'} ${cache.contextTokens} on ${cache.model}` : 'none'} ${(await $.clock.now()) - now} ms`, { to: 'debug' })

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
    const d = await decideFor($, cfg, `step ${e.index + 1}`, auth.key, text, await buildState($, text, mode, cache, now, cfg), mode, cache, now, cap)
    if (last.escalated && RANK.indexOf(d.alias) <= RANK.indexOf(last.alias)) return last // never de-escalate within a task
    const next: Decision = { ...d, turnId: last.turnId, unlocked: last.unlocked }
    await update($, lastAtom, () => next)

    return next
  } catch {
    return last
  }
}

// Routes one subagent from the text of its task. Called at spawn (the full prompt, so the pick is known before the
// subagent exists and the subagent list can show it) and, for agents no spawn hook saw, from their description.
async function routeSubagent($: EngineInterface, cfg: Config, kind: string, text: string, parentModel: string): Promise<Picked | null> {
  const auth = await resolveKey($, cfg)
  if (!auth) return null
  try {
    const now = await $.clock.now()
    const mode = await currentMode($, cfg)
    const cap = (await read($, lastAtom))?.unlocked ? 'none' : (await read($, capAtom)) ?? cfg.defaultCap

    return await decideFor($, cfg, kind, auth.key, text, composeState(text, mode, parentModel, '', null, now, cfg), mode, null, now, cap)
  } catch {
    return null
  }
}

async function routeAgent($: EngineInterface, cfg: Config, id: string, parentModel: string): Promise<Picked | null> {
  const info = (await $.agent.list()).find(a => a.id === id)

  return info?.description ? routeSubagent($, cfg, `agent ${info.type}: ${info.description}`, `Subagent task (${info.type}): ${info.description}`, parentModel) : null
}

// The running totals, loaded from the plugin store once (in session.start, so parallel steps never race on it).
const emptyTally = (name: string): Savings => ({ actual: 0, baseline: 0, steps: 0, name, models: {} })
async function tally($: EngineInterface, cfg: Config): Promise<Savings> {
  const stored = (await $.store.get('savings')) as Savings | undefined
  // a new baseline starts a new tally
  return stored && stored.name === cfg.baseline ? { ...emptyTally(cfg.baseline), ...stored } : emptyTally(cfg.baseline)
}

// Add one step to the running totals (kept across sessions in the plugin store).
async function record($: EngineInterface, cfg: Config, u: (StepUsage & { model: string }) | undefined) {
  const alias = u && aliasOf(u.model)
  if (!u || !alias) return
  totals ??= await tally($, cfg)
  totals.models[alias] = (totals.models[alias] ?? 0) + 1
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
  const defaultMode: Mode = PRESETS[String(options.preset)]?.mode ?? (MODES.includes(options.mode as Mode) ? (options.mode as Mode) : 'balanced')

  const defaultSticky: Sticky = STICKY.includes(options.stickiness as Sticky) ? (options.stickiness as Sticky) : 'auto'
  const preset = PRESETS[String(options.preset)]
  const defaultCap: EffortCap = preset?.cap ?? (CAPS.includes(options.effortCap as EffortCap) ? (options.effortCap as EffortCap) : 'high')
  const alias = (v: unknown) => (String(v) in CLAUDE ? String(v) : 'none')
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
    escalateAfter: num(options.escalateAfter, 3),
    ceiling: PRESETS[String(options.preset)]?.ceiling ?? alias(options.ceiling),
    floor: alias(options.floor),
    ceilingBreak: num(options.ceilingBreak, 0.9),
    sendHistory: flag(options.sendHistory, true),
    redact: flag(options.redact, true),
    maxTaskChars: num(options.maxTaskChars, 8000),
    fallback: options.fallback === 'heuristic' ? 'heuristic' : 'session',
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

  // Pick the subagent's model at spawn and show it in the subagent list.
  on('agent.spawn', async ($, e, next) => {
    if (!cfg.routeSubagents || !(await read($, enabledAtom)) || e.model) return next(e) // an explicit model on the Agent call wins
    const pick = await routeSubagent($, cfg, `spawn ${e.subagentType}: ${e.description}`, `Subagent task (${e.subagentType}): ${e.description}\n\n${e.prompt}`, e.parentModel)
    if (!pick) return next(e)
    const res = await next({ ...e, model: pick.alias, description: `${e.description} · ${pick.alias}/${pick.effort}` })
    if (res.agentId) agents.set(res.agentId, Promise.resolve(pick)) // its steps reuse the pick (and its effort)

    return res
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const segs: Seg[] = (await read($, enabledAtom))
      ? segments(await currentMode($, cfg), await read($, lastAtom), e.props.isWorking ? await read($, frameAtom) : null, await cacheLabel($, cfg), isPaused(await $.clock.now()), await read($, ranAtom))
      : [{ text: 'JEV ▏off▕', color: '#64748b' }, ...((await read($, ranAtom)) ? [{ text: `  ${(await read($, ranAtom))!.alias} (session model)`, color: '#475569' }] : [])]

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
    totals = await tally($, cfg)
    await $.command.register({
      name: 'jev',
      description: 'Jev model routing (prompt markers: !full !haiku !sonnet !opus !fable !cheap !efficient): efficient | balanced | cheap | sticky <off|auto|strict> | cap <effort|none> | ceiling <model|none> | floor <model|none> | full | preset <lean|balanced|max> | on | off | status | key <key>',
    })

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // A continuation, or a background notification, keeps the decision of the task it continues.
    if (!(await read($, enabledAtom)) || e.text.trim() === '' || skipNext) return next(e)
    task = e.text
    strikes = 0
    const pending = await read($, pendingAtom)
    if (pending) await update($, pendingAtom, () => null) // one prompt only, even if nothing can be routed
    const auth = await resolveKey($, cfg)
    if (!auth && !pending?.pin) { // a pinned model needs no Jev call, so no key either
      await update($, lastAtom, () => null) // never run this prompt on the previous task's pick
      if (!(await read($, warnedAtom))) {
        await update($, warnedAtom, () => true)
        $.ui.toast('Jev: no TypeSafe API key. Run /jev key <key> or set TYPESAFE_API_KEY')
      }
      return next(e)
    }

    const unlocked = pending?.full === true
    const mode = pending?.mode ?? (await currentMode($, cfg))
    try {
      const cache = await read($, cacheAtom)
      const now = await $.clock.now()
      const cap = unlocked ? 'none' : (await read($, capAtom)) ?? cfg.defaultCap
      // A pinned model skips Jev; its effort is the cap (high by default).
      const picked = pending?.pin
        ? { alias: pending.pin, model: CLAUDE[pending.pin]!.id, effort: cap === 'none' ? 'high' : cap, confidence: 1, pinned: true }
        : await decideFor($, cfg, 'prompt', auth!.key, e.text, await buildState($, e.text, mode, cache, now, cfg), mode, cache, now, cap)
      const decision: Decision = { turnId: e.turnId, ...picked, unlocked }
      await update($, lastAtom, () => decision)
    } catch (err) {
      await update($, lastAtom, () => null)
      if (!(await read($, warnedAtom))) {
        await update($, warnedAtom, () => true)
        $.ui.toast(`Jev unavailable (${(err as Error).message}), using ${await $.session.model()}`)
      }
    }

    return next(e)
  })

  // A task that keeps failing moves up one model for the rest of the task, whatever the cache guard says.
  on('tool.call', async ($, e, next) => {
    const res = await next(e)
    if (e.agentId !== undefined || !cfg.escalateAfter) return res
    strikes = 'isError' in res && res.isError ? strikes + 1 : 0
    const last = await read($, lastAtom)
    if (strikes >= cfg.escalateAfter && last && !last.escalated && !last.pinned) {
      const to = RANK[Math.min(RANK.indexOf(last.alias) + 1, RANK.length - 1)]!
      if (cfg.pool.includes(to) && to !== last.alias) {
        await update($, lastAtom, () => ({ ...last, alias: to, model: CLAUDE[to]!.id, escalated: true }))
        $.ui.log(`jev escalate: ${last.alias} -> ${to} after ${strikes} failed tool calls`, { to: 'debug' })
      }
    }

    return res
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
      await update($, ranAtom, () => ({ alias: aliasOf(u.model) ?? u.model, model: u.model, turnId: e.turnId, at }))
      // the band shows the cache going cold with no event to redraw it: write the atom again when the cache expires
      coldTimer?.cancel()
      coldTimer = $.clock.after(cfg.cacheTtlMs + 500, () => update($, ranAtom, r => (r ? { ...r } : r)))
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
    if (arg.startsWith('preset')) {
      const v = arg.slice(6).trim()
      const p = PRESETS[v]
      if (!p) return usage('preset', Object.keys(PRESETS))
      await update($, presetAtom, () => v)
      await update($, ceilingAtom, () => p.ceiling)
      await update($, capAtom, () => p.cap)
      await update($, modeAtom, () => p.mode)
      await update($, floorAtom, () => 'none')
      return applied(`preset (ceiling ${p.ceiling}, effort cap ${p.cap}, mode ${p.mode})`, v)
    }
    if (arg.startsWith('ceiling')) {
      const v = arg.slice(7).trim()
      if (v !== 'none' && !(v in CLAUDE)) return usage('ceiling', [...Object.keys(CLAUDE), 'none'])
      await update($, ceilingAtom, () => v)
      return applied('model ceiling', v)
    }
    if (arg.startsWith('floor')) {
      const v = arg.slice(5).trim()
      if (v !== 'none' && !(v in CLAUDE)) return usage('floor', [...Object.keys(CLAUDE), 'none'])
      await update($, floorAtom, () => v)
      return applied('model floor', v)
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
          ['preset', (await read($, presetAtom)) ?? (PRESETS[String(options.preset)] ? String(options.preset) : 'custom')],
          ['limits', `ceiling ${(await read($, ceilingAtom)) ?? cfg.ceiling} (break at ${cfg.ceilingBreak})   floor ${(await read($, floorAtom)) ?? cfg.floor}`],
          ['last', last ? `${last.alias} / ${last.effort}  ${gauge(last.confidence)} ${last.confidence.toFixed(2)}${last.kept ? `  kept (wanted ${last.kept})` : ''}${last.capped ? `  capped from ${last.capped}` : ''}${last.clamped ? `  clamped from ${last.clamped}` : ''}` : 'none yet'],
          ...usageRows(totals?.models ?? {}, cfg.pool),
          ['saved', savingsLine(totals ?? (await tally($, cfg)))],
          ['jev', isPaused(await $.clock.now()) ? `⚠ paused ${Math.ceil((pausedUntil - (await $.clock.now())) / 1000)} s` : '● ok'],
          ['key', auth ? `…${auth.key.slice(-4)}  (${auth.source})` : 'none: /jev key <key>'],
        ]),
      }
    }
    return { text: `Unknown option "${arg}". Use: /jev efficient | balanced | cheap | sticky <mode> | cap <effort|none> | full | on | off | status | key <key>` }
  })
}
