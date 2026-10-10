import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { PRESETS, capEffort, heuristic, limit, markers, redact, savingsLine, segments, stepUnits } from './register'

// Fake secrets, assembled at runtime so secret scanners do not flag this file.
const SK = ['sk', '-abcdefghijklmnop1234'].join('')
const GH = ['gh', 'p_abcdefghijklmnopqrst12'].join('')
const BEARER = ['Bear', 'er abcdefghijklmnop12345'].join('')
const DBURL = ['postgres', '://admin:s3cr3t@db.internal:5432/app'].join('')
const OPTS = { options: { apiKey: 'k-test', mode: 'balanced' } }

type World = { messages: any[]; bodies: any[]; steps: any[]; toasts: string[]; usage: any; clock: ReturnType<typeof mock.clock> }

function world(on: On, answer: () => { ok: boolean; status: number; text: string }): World {
  const w: World = { messages: [], bodies: [], steps: [], toasts: [], usage: null, clock: mock.clock(on) }
  on('http.fetch', async (_$, e) => {
    w.bodies.push({ ...JSON.parse(e.init?.body ?? '{}'), auth: e.init?.headers?.authorization })
    return { value: { headers: {}, ...answer() } }
  })
  on('session.model', async () => ({ value: 'claude-sonnet-5-5' }))
  on('session.messages', async () => ({ value: w.messages }))
  on('ui.toast', async (_$, e) => {
    w.toasts.push(String(e.text))
    return { value: undefined }
  })
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_$, e) {
    w.steps.push(e)
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: w.usage }
  })
  return w
}

const jev = (model: string, effort: string) => () => ({
  ok: true,
  status: 200,
  text: JSON.stringify({
    answers: {
      model: { type: 'choice', choice: model, confidence: 0.9 },
      effort: { type: 'choice', choice: effort, confidence: 0.8 },
    },
  }),
})

async function step($: Engine, turnId: string, agentId?: string) {
  const s = $.turn.step({ turnId, index: 0, model: 'claude-sonnet-5-5', effort: 'medium', messageCount: 1, ...(agentId ? { agentId } : {}) })
  for await (const _ of s) {
  }
}

test('routes the turn to the model and effort Jev picks', OPTS, async ($, on) => {
  const w = world(on, jev('opus', 'high'))
  await $.turn.start({ text: 'Design a sharded job queue', turnId: 't1' })
  await step($, 't1')

  expect(w.bodies[0].questions.model.criteria).toHaveProperty('opus')
  expect(w.bodies[0].state).toContain('Routing mode: balanced')
  expect(w.steps[0].model).toBe('claude-opus-5-5')
  expect(w.steps[0].effort).toBe('high')
})

test('a continuation keeps the previous decision without calling Jev', OPTS, async ($, on) => {
  const w = world(on, jev('haiku', 'low'))
  await $.turn.start({ text: 'rename foo to bar', turnId: 't1' })
  await $.turn.start({ text: '', turnId: 't2' })
  await step($, 't2')

  expect(w.bodies.length).toBe(1)
  expect(w.steps[0].model).toBe('claude-haiku-5-5')
})

test('a Jev failure keeps the session model and warns once', OPTS, async ($, on) => {
  const w = world(on, () => ({ ok: false, status: 500, text: 'boom' }))
  await $.turn.start({ text: 'task one', turnId: 't1' })
  await $.turn.start({ text: 'task two', turnId: 't2' })
  await step($, 't2')

  expect(w.steps[0].model).toBe('claude-sonnet-5-5')
  expect(w.steps[0].effort).toBe('medium')
  expect(w.toasts.length).toBe(1)
  expect(w.toasts[0]).toContain('HTTP 500')
})

test('/jev cheap changes the mode sent to Jev', OPTS, async ($, on) => {
  const w = world(on, jev('haiku', 'low'))
  const r = await $.command.run({ command: 'jev', args: 'cheap' } as any)
  expect(JSON.stringify(r)).toContain('cheap')
  await $.turn.start({ text: 'fix the typo', turnId: 't1' })

  expect(w.bodies[0].state).toContain('Routing mode: cheap')
  expect(w.bodies[0].questions.model.instructions).toContain('cheapest')
})

test('/jev off leaves the session model alone', OPTS, async ($, on) => {
  const w = world(on, jev('opus', 'max'))
  await $.command.run({ command: 'jev', args: 'off' } as any)
  await $.turn.start({ text: 'anything', turnId: 't1' })
  await step($, 't1')

  expect(w.bodies.length).toBe(0)
  expect(w.steps[0].model).toBe('claude-sonnet-5-5')
})

test('subagent steps are left alone with routeSubagents off', { options: { apiKey: 'k-test', routeSubagents: false } }, async ($, on) => {
  const w = world(on, jev('opus', 'high'))
  await $.turn.start({ text: 'big task', turnId: 't1' })
  await step($, 't1', 'agent-1')

  expect(w.steps[0].model).toBe('claude-sonnet-5-5')
})

test('/jev key stores a key that Jev calls then use', { options: { mode: 'balanced' } }, async ($, on) => {
  mock.store(on)
  mock.env(on, {})
  const w = world(on, jev('sonnet', 'medium'))
  await $.turn.start({ text: 'first', turnId: 't0' })
  expect(w.bodies.length).toBe(0)
  expect(w.toasts[0]).toContain('/jev key')

  await $.command.run({ command: 'jev', args: 'key ts_live_ABCD' } as any)
  await $.turn.start({ text: 'second', turnId: 't1' })
  expect(w.bodies.length).toBe(1)
  expect(w.bodies[0].auth).toBe('Bearer ts_live_ABCD')
})

test('TYPESAFE_API_KEY is used when no key is configured', { options: { mode: 'balanced' } }, async ($, on) => {
  mock.store(on)
  mock.env(on, { TYPESAFE_API_KEY: 'ts_env' })
  const w = world(on, jev('haiku', 'low'))
  await $.turn.start({ text: 'task', turnId: 't1' })
  expect(w.bodies.length).toBe(1)
})

const usage = (model: string, tokens: number) => ({
  model,
  input_tokens: 10,
  output_tokens: 10,
  cache_read_input_tokens: tokens,
  cache_creation_input_tokens: 0,
})

// One finished task on `model` that left `tokens` of context in the cache.
async function warmUp(w: World, $: Engine, model: string, tokens: number) {
  w.usage = usage(model, tokens)
  await $.turn.start({ text: 'warm up', turnId: 'w0' })
  await step($, 'w0')
  w.steps.length = 0
  w.bodies.length = 0
}

test('warm cache: a downgrade is refused, effort still follows Jev', OPTS, async ($, on) => {
  const w = world(on, jev('haiku', 'low'))
  await warmUp(w, $, 'claude-sonnet-5-5', 50_000)
  await $.turn.start({ text: 'rename foo to bar', turnId: 't1' })
  await step($, 't1')

  expect(w.steps[0].model).toBe('claude-sonnet-5-5')
  expect(w.steps[0].effort).toBe('low')
  expect(w.bodies[0].state).toContain('Prompt cache: warm')
  expect(segments('balanced', { turnId: 't1', model: 'claude-sonnet-5-5', alias: 'sonnet', effort: 'low', confidence: 0.9, kept: 'haiku' } as any).map(x => x.text).join('')).toContain('wanted haiku')
})

test('warm cache: a confident upgrade goes through', OPTS, async ($, on) => {
  const w = world(on, jev('opus', 'high'))
  await warmUp(w, $, 'claude-sonnet-5-5', 50_000)
  await $.turn.start({ text: 'redesign the queue', turnId: 't1' })
  await step($, 't1')

  expect(w.steps[0].model).toBe('claude-opus-5-5')
})

test('warm cache: a low-confidence upgrade is refused', OPTS, async ($, on) => {
  const w = world(on, () => ({
    ok: true,
    status: 200,
    text: JSON.stringify({ answers: { model: { choice: 'opus', confidence: 0.4 }, effort: { choice: 'high' } } }),
  }))
  await warmUp(w, $, 'claude-sonnet-5-5', 50_000)
  await $.turn.start({ text: 'maybe hard', turnId: 't1' })
  await step($, 't1')

  expect(w.steps[0].model).toBe('claude-sonnet-5-5')
})

test('cold cache: a downgrade is allowed', OPTS, async ($, on) => {
  const w = world(on, jev('haiku', 'low'))
  await warmUp(w, $, 'claude-sonnet-5-5', 50_000)
  await w.clock.advance(10 * 60_000)
  await $.turn.start({ text: 'rename foo to bar', turnId: 't1' })
  await step($, 't1')

  expect(w.steps[0].model).toBe('claude-haiku-5-5')
  expect(w.bodies[0].state).toContain('Prompt cache: cold')
})

test('small context: switching is free', OPTS, async ($, on) => {
  const w = world(on, jev('haiku', 'low'))
  await warmUp(w, $, 'claude-sonnet-5-5', 500)
  await $.turn.start({ text: 'rename foo to bar', turnId: 't1' })
  await step($, 't1')

  expect(w.steps[0].model).toBe('claude-haiku-5-5')
})

test('strict refuses even a confident upgrade; off follows Jev', OPTS, async ($, on) => {
  const w = world(on, jev('opus', 'high'))
  await warmUp(w, $, 'claude-sonnet-5-5', 50_000)
  await $.command.run({ command: 'jev', args: 'sticky strict' } as any)
  await $.turn.start({ text: 'big', turnId: 't1' })
  await step($, 't1')
  expect(w.steps[0].model).toBe('claude-sonnet-5-5')

  await $.command.run({ command: 'jev', args: 'sticky off' } as any)
  await $.turn.start({ text: 'big again', turnId: 't2' })
  await step($, 't2')
  expect(w.steps[1].model).toBe('claude-opus-5-5')
})

test('a step without usage leaves the cache untouched', OPTS, async ($, on) => {
  const w = world(on, jev('haiku', 'low'))
  await warmUp(w, $, 'claude-sonnet-5-5', 50_000)
  w.usage = null
  await $.turn.start({ text: 'one', turnId: 't1' })
  await step($, 't1')
  await $.turn.start({ text: 'two', turnId: 't2' })
  await step($, 't2')

  expect(w.steps[1].model).toBe('claude-sonnet-5-5')
})

test('effort is capped at high by default', OPTS, async ($, on) => {
  const w = world(on, jev('opus', 'xhigh'))
  await $.turn.start({ text: 'redesign the queue', turnId: 't1' })
  await step($, 't1')

  expect(w.steps[0].model).toBe('claude-opus-5-5')
  expect(w.steps[0].effort).toBe('high')
})

test('effortCap none and a lower effort pass through untouched', { options: { apiKey: 'k-test', effortCap: 'none' } }, async ($, on) => {
  const w = world(on, jev('opus', 'max'))
  await $.turn.start({ text: 'redesign the queue', turnId: 't1' })
  await step($, 't1')
  expect(w.steps[0].effort).toBe('max')
})

test('/jev cap changes the cap', OPTS, async ($, on) => {
  const w = world(on, jev('opus', 'xhigh'))
  await $.command.run({ command: 'jev', args: 'cap medium' } as any)
  await $.turn.start({ text: 'redesign the queue', turnId: 't1' })
  await step($, 't1')
  expect(w.steps[0].effort).toBe('medium')
})

test('/jev full lifts the cap for one prompt only', OPTS, async ($, on) => {
  const w = world(on, jev('opus', 'xhigh'))
  await $.command.run({ command: 'jev', args: 'full' } as any)
  await $.turn.start({ text: 'first', turnId: 't1' })
  await step($, 't1')
  await $.turn.start({ text: 'second', turnId: 't2' })
  await step($, 't2')

  expect(w.steps[0].effort).toBe('xhigh')
  expect(w.steps[1].effort).toBe('high')
})

test('a !full prefix lifts the cap for that prompt and is stripped', OPTS, async ($, on) => {
  const w = world(on, jev('opus', 'xhigh'))
  const sent: string[] = []
  on('prompt.submit', async (_$, e) => ({ text: (sent.push(e.text), e.text) }))
  await $.prompt.submit({ text: '!full redesign the queue' } as any)
  await $.turn.start({ text: 'redesign the queue', turnId: 't1' })
  await step($, 't1')

  expect(sent[0]).toBe('redesign the queue')
  expect(w.steps[0].effort).toBe('xhigh')
})

test('capEffort', OPTS, async () => {
  expect(capEffort('xhigh', 'high')).toEqual({ effort: 'high', capped: 'xhigh' })
  expect(capEffort('medium', 'high')).toEqual({ effort: 'medium' })
  expect(capEffort('max', 'none')).toEqual({ effort: 'max' })
})

test('every step after the first asks Jev again', OPTS, async ($, on) => {
  const w = world(on, jev('sonnet', 'medium'))
  await $.turn.start({ text: 'build the feature', turnId: 't1' })
  await step($, 't1')
  const s = $.turn.step({ turnId: 't1', index: 1, model: 'claude-sonnet-5-5', effort: 'medium', messageCount: 3 })
  for await (const _ of s) {
  }

  expect(w.bodies.length).toBe(2)
  expect(w.bodies[1].state).toContain('step 2 of this task')
})

test('routeSteps off: one call per prompt', { options: { apiKey: 'k-test', routeSteps: false } }, async ($, on) => {
  const w = world(on, jev('sonnet', 'medium'))
  await $.turn.start({ text: 'build the feature', turnId: 't1' })
  const s = $.turn.step({ turnId: 't1', index: 1, model: 'claude-sonnet-5-5', effort: 'medium', messageCount: 3 })
  for await (const _ of s) {
  }

  expect(w.bodies.length).toBe(1)
})

test('a subagent is routed once from its description', OPTS, async ($, on) => {
  const w = world(on, jev('haiku', 'low'))
  on('agent.list', async () => ({ value: [{ id: 'agent-1', description: 'find where parseDuration is defined', type: 'Explore' }] }))
  await step($, 't1', 'agent-1')
  await step($, 't1', 'agent-1')

  expect(w.bodies.length).toBe(1)
  expect(w.bodies[0].state).toContain('Subagent task (Explore): find where parseDuration')
  expect(w.steps.map(x => x.model)).toEqual(['claude-haiku-5-5', 'claude-haiku-5-5'])
})

test('three failures pause Jev, then it recovers', OPTS, async ($, on) => {
  let ok = false
  const w = world(on, () => (ok ? jev('sonnet', 'low')() : { ok: false, status: 500, text: 'boom' }))
  for (const n of [1, 2, 3, 4]) await $.turn.start({ text: `task ${n}`, turnId: `t${n}` })
  expect(w.bodies.length).toBe(3) // the 4th prompt never reached the API
  expect(w.toasts.some(t => t.includes('paused'))).toBe(true)

  ok = true
  await w.clock.advance(61_000)
  await $.turn.start({ text: 'task 5', turnId: 't5' })
  expect(w.bodies.length).toBe(4)
})

test('strict plus a warm cache makes no step calls', { options: { apiKey: 'k-test', stickiness: 'strict' } }, async ($, on) => {
  const w = world(on, jev('opus', 'high'))
  await warmUp(w, $, 'claude-sonnet-5-5', 50_000)
  await $.turn.start({ text: 'build it', turnId: 't1' })
  const before = w.bodies.length
  const s = $.turn.step({ turnId: 't1', index: 1, model: 'claude-sonnet-5-5', effort: 'medium', messageCount: 3 })
  for await (const _ of s) {
  }
  expect(w.bodies.length).toBe(before)
})

test('a background-task notification keeps the decision and makes no call', OPTS, async ($, on) => {
  const w = world(on, jev('opus', 'high'))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  await $.turn.start({ text: 'real task', turnId: 't1' })
  await $.prompt.submit({ text: '<task-notification>done</task-notification>', origin: { kind: 'task-notification' } } as any)
  await $.turn.start({ text: '<task-notification>done</task-notification>', turnId: 't2' })
  await step($, 't2')

  expect(w.bodies.length).toBe(1)
  expect(w.steps[0].model).toBe('claude-opus-5-5')
})

test('!opus pins the model without calling Jev; !cheap sets the mode for one prompt', OPTS, async ($, on) => {
  const w = world(on, jev('haiku', 'low'))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  await $.prompt.submit({ text: '!opus hard thing' } as any)
  await $.turn.start({ text: 'hard thing', turnId: 't1' })
  await step($, 't1')
  expect(w.bodies.length).toBe(0)
  expect(w.steps[0].model).toBe('claude-opus-5-5')
  expect(w.steps[0].effort).toBe('high')

  await $.prompt.submit({ text: '!cheap rename x' } as any)
  await $.turn.start({ text: 'rename x', turnId: 't2' })
  expect(w.bodies[0].state).toContain('Routing mode: cheap')
  await $.turn.start({ text: 'another', turnId: 't3' })
  expect(w.bodies[1].state).toContain('Routing mode: balanced')
})

test('markers strips known markers and leaves unknown ones', OPTS, async () => {
  expect(markers('!full !opus go', ['haiku', 'opus'])).toEqual({ text: 'go', pending: { full: true, pin: 'opus' } })
  expect(markers('!nope go', ['opus'])).toEqual({ text: '!nope go', pending: null })
  expect(markers('plain', ['opus']).pending).toBeNull()
})

test('stepUnits prices cache reads low and output high, scaled by model weight', OPTS, async () => {
  const u = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 10_000, cache_creation_input_tokens: 0 }
  expect(stepUnits(u, "opus")).toBe(12.5)
  expect(stepUnits(u, "haiku") * 5).toBe(12.5)
  expect(savingsLine({ actual: 60, baseline: 100, steps: 4, name: 'opus', models: {} })).toContain('40% vs always opus over 4 steps')
})

test('/jev status shows savings after steps and /jev stats clear resets them', OPTS, async ($, on) => {
  mock.store(on)
  const w = world(on, jev('sonnet', 'medium'))
  w.usage = usage('claude-sonnet-5-5', 20_000)
  await $.turn.start({ text: 'task', turnId: 't1' })
  await step($, 't1')
  expect(JSON.stringify(await $.command.run({ command: 'jev', args: 'status' } as any))).toContain('vs always opus over 1 steps')
  await $.command.run({ command: 'jev', args: 'stats clear' } as any)
  expect(JSON.stringify(await $.command.run({ command: 'jev', args: 'status' } as any))).toContain('no steps measured yet')
})

test('three failed tool calls in a row move the task up one model', OPTS, async ($, on) => {
  const w = world(on, jev('haiku', 'low'))
  on('tool.call', async () => ({ result: { stdout: '', stderr: 'boom' }, isError: true }) as any)
  await $.turn.start({ text: 'fix the build', turnId: 't1' })
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: 'false' } as any)
  await step($, 't1')

  expect(w.steps[0].model).toBe('claude-sonnet-5-5')
})

test('redact hides keys, tokens and secret assignments', OPTS, async () => {
  expect(redact(`use ${SK} and ${GH} please`)).toBe('use [redacted] and [redacted] please')
  expect(redact(['export STRIPE_SECRET_KEY=', 'whsec_abc123', ' then run'].join(''))).toContain('STRIPE_SECRET_KEY=[redacted]')
  expect(redact(`Authorization: ${BEARER}`)).toBe('Authorization: [redacted]')
  expect(redact('nothing secret here')).toBe('nothing secret here')
})

test('secrets never reach Jev and history can be switched off', { options: { apiKey: 'k-test', sendHistory: false } }, async ($, on) => {
  const w = world(on, jev('sonnet', 'low'))
  w.messages.push({ role: 'user', text: 'earlier talk' })
  await $.turn.start({ text: `deploy with ${SK}`, turnId: 't1' })
  expect(w.bodies[0].state).not.toContain(SK)
  expect(w.bodies[0].state).toContain('[redacted]')
  expect(w.bodies[0].state).not.toContain('earlier talk')
})

test('heuristic fallback picks locally when Jev is down', { options: { apiKey: 'k-test', fallback: 'heuristic' } }, async ($, on) => {
  const w = world(on, () => ({ ok: false, status: 500, text: 'boom' }))
  await $.turn.start({ text: 'rename foo to bar', turnId: 't1' })
  await step($, 't1')
  expect(w.steps[0].model).toBe('claude-haiku-5-5')
  expect(heuristic('find the root cause of the race condition', ['haiku', 'sonnet', 'opus']).alias).toBe('opus')
  expect(heuristic('add a button', ['sonnet']).alias).toBe('sonnet')
})

test('a subagent is routed at spawn: model set, description tagged, steps reuse the pick', OPTS, async ($, on) => {
  const w = world(on, jev('haiku', 'low'))
  let seen: any
  on('agent.spawn', async (_$, e) => {
    seen = e
    return { model: e.model ?? '', agentId: 'agent-9' } as any
  })
  on('agent.list', async () => ({ value: [] }))
  await $.agent.spawn({ prompt: 'List every file that imports pricing.js', description: 'find importers', subagentType: 'Explore' } as any)
  await step($, 't1', 'agent-9')

  expect(seen.model).toBe('haiku')
  expect(seen.description).toBe('find importers · haiku/low')
  expect(w.bodies.length).toBe(1) // spawn only; the first step reused the pick
  expect(w.bodies[0].state).toContain('List every file that imports pricing.js')
  expect(w.steps[0].model).toBe('claude-haiku-5-5')
})

test('an explicit model on the Agent call is respected', OPTS, async ($, on) => {
  const w = world(on, jev('haiku', 'low'))
  on('agent.spawn', async (_$, e) => ({ model: e.model ?? '', agentId: 'agent-8' }) as any)
  await $.agent.spawn({ prompt: 'x', description: 'y', subagentType: 'Explore', model: 'opus' } as any)
  expect(w.bodies.length).toBe(0)
})

test('redact catches lowercase names, JSON keys and URL credentials, and leaves type words', OPTS, async () => {
  expect(redact('password=hunter2')).toBe('password=[redacted]')
  expect(redact('client_secret: xyz123')).toBe('client_secret: [redacted]')
  expect(redact('export api_key=abc123def456')).toBe('export api_key=[redacted]')
  expect(redact('{"apiKey": "abcd1234efgh5678"}')).toBe('{"apiKey": "[redacted]"}')
  expect(redact(DBURL)).toBe('postgres://admin:[redacted]@db.internal:5432/app')
  expect(redact('AWS_SECRET_ACCESS_KEY=abc/def+ghi')).toContain('[redacted]')
  expect(redact('DEFAULT_KEY: 3 and token: string')).toBe('DEFAULT_KEY: 3 and token: string')
})

test('!opus works without a Jev key, and the marker does not leak to the next prompt', { options: { mode: 'balanced' } }, async ($, on) => {
  mock.store(on)
  mock.env(on, {})
  const w = world(on, jev('haiku', 'low'))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  await $.prompt.submit({ text: '!opus hard thing' } as any)
  await $.turn.start({ text: 'hard thing', turnId: 't1' })
  await step($, 't1')
  expect(w.steps[0].model).toBe('claude-opus-5-5')

  await $.turn.start({ text: 'next thing', turnId: 't2' }) // no key: warns, no pin left over
  await step($, 't2')
  expect(w.steps[1].model).not.toBe('claude-opus-5-5')
})

const pk = (alias: string, confidence: number) => ({ alias, model: `claude-${alias}-5-5`, effort: 'high', confidence }) as any

test('limit clamps above the ceiling unless Jev is very sure, and raises to the floor', OPTS, async () => {
  const pool = ['haiku', 'sonnet', 'opus', 'fable']
  expect(limit(pk('opus', 0.6), 'sonnet', 'none', 0.9, pool)).toMatchObject({ alias: 'sonnet', clamped: 'opus' })
  expect(limit(pk('opus', 0.95), 'sonnet', 'none', 0.9, pool).alias).toBe('opus')
  expect(limit(pk('haiku', 0.9), 'none', 'sonnet', 0.9, pool)).toMatchObject({ alias: 'sonnet', clamped: 'haiku' })
  expect(limit(pk('fable', 0.5), 'sonnet', 'none', 0.9, ['haiku', 'opus', 'fable']).alias).toBe('haiku') // sonnet not allowed: nearest below
  expect(limit(pk('sonnet', 0.5), 'sonnet', 'sonnet', 0.9, pool).clamped).toBeUndefined()
})

test('a ceiling stops an opus pick; !opus and the confidence break are not stopped', { options: { apiKey: 'k-test', ceiling: 'sonnet', ceilingBreak: 0.95 } }, async ($, on) => {
  const w = world(on, jev('opus', 'high')) // confidence 0.9 < 0.95
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  await $.turn.start({ text: 'redesign the queue', turnId: 't1' })
  await step($, 't1')
  expect(w.steps[0].model).toBe('claude-sonnet-5-5')

  await $.prompt.submit({ text: '!opus hard thing' } as any)
  await $.turn.start({ text: 'hard thing', turnId: 't2' })
  await step($, 't2')
  expect(w.steps[1].model).toBe('claude-opus-5-5')
})

test('/jev ceiling and /jev floor change the limits at runtime', { options: { apiKey: 'k-test', ceilingBreak: 0.95 } }, async ($, on) => {
  mock.store(on)
  const w = world(on, jev('opus', 'high'))
  expect(JSON.stringify(await $.command.run({ command: 'jev', args: 'ceiling nope' } as any))).toContain('Usage')
  await $.command.run({ command: 'jev', args: 'ceiling haiku' } as any)
  await $.command.run({ command: 'jev', args: 'floor haiku' } as any)
  await $.turn.start({ text: 'redesign the queue', turnId: 't1' })
  await step($, 't1')
  expect(w.steps[0].model).toBe('claude-haiku-5-5')
  expect(JSON.stringify(await $.command.run({ command: 'jev', args: 'status' } as any))).toContain('ceiling haiku')
})

test('the ceiling is applied before the cache guard sees the pick', { options: { apiKey: 'k-test', ceiling: 'sonnet', ceilingBreak: 0.95 } }, async ($, on) => {
  const w = world(on, jev('opus', 'high'))
  await warmUp(w, $, 'claude-sonnet-5-5', 50_000)
  await $.turn.start({ text: 'redesign the queue', turnId: 't1' })
  await step($, 't1')
  expect(w.steps[0].model).toBe('claude-sonnet-5-5') // clamped to sonnet, which is the warm model: nothing to keep
})

const dec = (alias: string, extra: object = {}) => ({ turnId: 't1', model: `claude-${alias}-5-5`, alias, effort: 'high', confidence: 0.8, ...extra }) as any
const text = (segs: { text: string }[]) => segs.map(s => s.text).join('')

test('segments: the model that ran wins over the pick, but only within the same task', OPTS, async () => {
  const ran = (alias: string, turnId: string) => ({ alias, model: `claude-${alias}-5-5`, turnId, at: 0 })
  expect(text(segments('balanced', dec('haiku'), null, null, false, ran('sonnet', 't1')))).toContain('sonnet (picked haiku)')
  expect(text(segments('balanced', dec('haiku'), null, null, false, ran('sonnet', 'earlier')))).not.toContain('picked')
  expect(text(segments('balanced', dec('haiku'), null, null, false, ran('haiku', 't1')))).not.toContain('picked')
  expect(text(segments('balanced', dec('sonnet', { clamped: 'opus' })))).toContain('⤒opus')
})

test('segments: with no pick the band shows the session model that ran, not "waiting"', OPTS, async () => {
  const ran = { alias: 'sonnet', model: 'claude-sonnet-5-5', turnId: 't9', at: 0 }
  expect(text(segments('balanced', null, null, null, false, ran))).toContain('sonnet (session model)')
  expect(text(segments('balanced', null))).toContain('waiting for the first task')
})

test('/jev preset lean sets ceiling, effort cap and mode; later commands still win', { options: { apiKey: 'k-test', ceilingBreak: 0.95 } }, async ($, on) => {
  mock.store(on)
  const w = world(on, jev('opus', 'xhigh'))
  expect(JSON.stringify(await $.command.run({ command: 'jev', args: 'preset nope' } as any))).toContain('Usage')
  await $.command.run({ command: 'jev', args: 'preset lean' } as any)
  await $.turn.start({ text: 'redesign the queue', turnId: 't1' })
  await step($, 't1')
  expect(w.steps[0].model).toBe('claude-sonnet-5-5') // ceiling
  expect(w.steps[0].effort).toBe('medium') // cap
  await $.command.run({ command: 'jev', args: 'cap high' } as any)
  await $.turn.start({ text: 'again', turnId: 't2' })
  await step($, 't2')
  expect(w.steps[1].effort).toBe('high')
  expect(JSON.stringify(await $.command.run({ command: 'jev', args: 'status' } as any))).toContain('preset')
  expect(Object.keys(PRESETS)).toEqual(['lean', 'balanced', 'max'])
})

test('the preset option sets the starting limits', { options: { apiKey: 'k-test', preset: 'lean', ceilingBreak: 0.95 } }, async ($, on) => {
  const w = world(on, jev('opus', 'xhigh'))
  await $.turn.start({ text: 'redesign the queue', turnId: 't1' })
  await step($, 't1')
  expect(w.steps[0].model).toBe('claude-sonnet-5-5')
  expect(w.steps[0].effort).toBe('medium')
})
