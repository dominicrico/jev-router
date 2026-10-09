import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const OPTS = { options: { apiKey: 'k-test', mode: 'balanced' } }

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
} as any

// Only what a routed turn needs: a Jev answer, the session model and the turn bottom.
function stubs(on: On, failJev = false) {
  mock.clock(on)
  on('http.fetch', async () => ({
    value: failJev ? { headers: {}, ok: false, status: 500, text: 'boom' } : {
      headers: {},
      ok: true,
      status: 200,
      text: JSON.stringify({
        answers: {
          model: { type: 'choice', choice: 'opus', confidence: 0.9 },
          effort: { type: 'choice', choice: 'high', confidence: 0.8 },
        },
      }),
    },
  }))
  on('session.model', async () => ({ value: 'claude-sonnet-5-5' }))
  on('session.messages', async () => ({ value: [] }))
  on('ui.toast', async () => ({ value: undefined }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
}

const mountBand = ($: any, props = PROPS) => $.ui.mount({ plugin: 'jev-router', surface: 'terminal', component: 'AbovePrompt', props })

test('the band waits for the first task before any decision', OPTS, async ($, on) => {
  stubs(on)
  const ui = await mountBand($)
  const band = JSON.stringify(await ui.drawn())
  expect(band).toContain('JEV')
  expect(band).toContain('waiting for the first task')
  await ui.unmount()
})

test('the band shows the model alias after a routed turn', OPTS, async ($, on) => {
  stubs(on)
  await $.turn.start({ text: 'Design a sharded job queue', turnId: 't1' })
  const ui = await mountBand($)
  const band = JSON.stringify(await ui.drawn())
  expect(band).toContain('opus')
  expect(band).not.toContain('waiting for the first task')
  await ui.unmount()
})

// A step that reports the model it really ran on, whatever the router asked for.
function stepOn(on: On, model: string) {
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model, input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
  })
}
const step = ($: any, turnId: string) => $.turn.step({ turnId, index: 0, model: 'claude-sonnet-5-5', effort: 'medium', messageCount: 1 })

test('the band flags a step that ran on another model than the pick', OPTS, async ($, on) => {
  stubs(on)
  stepOn(on, 'claude-sonnet-5-5') // the router picked opus
  await $.turn.start({ text: 'Design a sharded job queue', turnId: 't1' })
  for await (const _ of step($, 't1')) {
  }
  const ui = await mountBand($)
  const band = JSON.stringify(await ui.drawn())
  expect(band).toContain('picked opus')
  await ui.unmount()
})

test('the band shows the session model after a Jev failure instead of waiting', OPTS, async ($, on) => {
  stubs(on, true)
  stepOn(on, 'claude-sonnet-5-5')
  await $.turn.start({ text: 'Design a sharded job queue', turnId: 't1' })
  for await (const _ of step($, 't1')) {
  }
  const ui = await mountBand($)
  const band = JSON.stringify(await ui.drawn())
  expect(band).toContain('session model')
  expect(band).not.toContain('waiting for the first task')
  await ui.unmount()
})
