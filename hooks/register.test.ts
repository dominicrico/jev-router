import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { statusLine } from './register'

const OPTS = { options: { apiKey: 'k-test', mode: 'balanced' } }

type World = { bodies: any[]; steps: any[]; toasts: string[]; status: (string | undefined)[]; usage: any; clock: ReturnType<typeof mock.clock> }

function world(on: On, answer: () => { ok: boolean; status: number; text: string }): World {
  const w: World = { bodies: [], steps: [], toasts: [], status: [], usage: null, clock: mock.clock(on) }
  on('http.fetch', async (_$, e) => {
    w.bodies.push({ ...JSON.parse(e.init?.body ?? '{}'), auth: e.init?.headers?.authorization })
    return { value: { headers: {}, ...answer() } }
  })
  on('session.model', async () => ({ value: 'claude-sonnet-5-5' }))
  on('session.messages', async () => ({ value: [] }))
  on('ui.status', async (_$, e) => {
    w.status.push(e.text)
    return { value: undefined }
  })
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

test('subagent steps are not rerouted', OPTS, async ($, on) => {
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
  expect(statusLine('balanced', { turnId: 't1', model: 'claude-sonnet-5-5', alias: 'sonnet', effort: 'low', confidence: 0.9, kept: 'haiku' })).toContain('wanted haiku')
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
