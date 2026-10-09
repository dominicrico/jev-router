<p align="center">
  <img src="assets/logo.jpg" width="200" alt="Jev Router, the smug switchman raccoon">
</p>

<h1 align="center">jev-router</h1>

<p align="center">
  <em>He pulls one lever. Your task rides the right track.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/dominicrico/jev-router?style=flat-square&color=111111&label=release&include_prereleases" alt="Release">
  <img src="https://img.shields.io/badge/Claude%20Code-mod-111111?style=flat-square" alt="Claude Code mod">
  <img src="https://img.shields.io/badge/models-haiku%20%C2%B7%20sonnet%20%C2%B7%20opus%20%C2%B7%20fable-111111?style=flat-square" alt="Models">
  <img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT license">
</p>

<p align="center">
  <img src="assets/hero.jpg" width="880" alt="jev-router: right model, right effort, every task. Tasks routed to haiku, sonnet or opus, minus 97% cost on trivial tasks, minus 65% on standard, 253 ms per pick. And yet hard tasks cost more.">
</p>

<p align="center">
  <strong>A Claude Code mod that asks <a href="#how-it-works">TypeSafe Jev</a> which Claude model and effort each task needs.</strong><br>
  <sub>Rename a variable on Haiku. Redesign the queue on Opus. Never pay castle prices for a hut.</sub>
</p>

---

You know the problem. You rename one variable and your most expensive model thinks about it for a minute. Or you start a gnarly refactor and a bargain model happily shrugs.

jev-router puts a switchman in front of your session. Before every task he reads it, asks Jev, pulls the lever, and the turn runs on the model and reasoning effort that fit. He is smug about it. You will see.

## The band

A live band above your prompt shows what he picked. Colour coded, with a spinner while a task runs.

<p align="center">
  <img src="assets/band.gif" width="880" alt="The band in all its states, one slide at a time: idle, running, haiku, sonnet, capped opus, !full unlock, cache kept, pinned, escalated, low confidence, cheap mode, paused, off.">
</p>

<p align="center">
  <img src="assets/band.png" width="880" alt="The band above the prompt: JEV, balanced mode, sonnet, medium effort, 88% confidence, warm cache of 42k tokens. Four colour-coded tiers below: haiku trivial, sonnet standard, opus hard, fable hardest.">
</p>

| Part | Meaning |
| --- | --- |
| `balanced` | Routing mode: `efficient`, `balanced` or `cheap` |
| `sonnet ▂▄__` | The model the task runs on, with its tier. Green haiku, blue sonnet, purple opus, gold fable |
| `medium ▰▰▱▱▱` | Reasoning effort, `low` to `max` |
| `conf ▮▮▮▮▯ 88%` | How sure Jev is. Green from 70%, amber from 50%, red below |
| `cache 🔒 warm 42k` | Whether the prompt cache is still worth protecting, and how big it is |

When the cache wins, the band says so: `opus (kept 🔒 cache warm; wanted haiku)`.

## What he does

- **Picks the model and the effort**, before every task, from haiku, sonnet, opus and fable. You can narrow the pool.
- **Three routing modes.** `efficient` for the best result, `balanced` for quality and cost evenly, `cheap` for the cheapest model that can plausibly succeed.
- **Guards the prompt cache.** Switching models throws the cache away. While it is warm and big enough to matter, he stays put unless Jev confidently asks for something stronger.
- **Caps the effort.** Jev's effort pick is limited to `high` by default, because effort drives token use far more than the model does. Start a prompt with `!full` (or run `/jev full`) to lift the cap for that one prompt.
- **Escalates when a task struggles.** After `escalateAfter` (default 3) failed tool calls in a row, the rest of the task moves up one model. The band shows `↑`.
- **Pins a model for one prompt.** Start a prompt with `!opus`, `!sonnet`, `!haiku` or `!fable` to skip Jev and use that model (at the effort cap). `!cheap` and `!efficient` set the routing mode for that prompt. Markers combine, like `!opus !full`.
- **Keeps a savings tally.** `/jev status` shows an estimated saving against the model you would otherwise use (`baselineModel`, default opus), kept across sessions. It is a model-price estimate in relative units, blind to effort.
- **Never blocks you.** After 3 failed Jev calls in a row it pauses for a minute instead of paying a timeout on every step. Optional `fallback: heuristic` guesses locally meanwhile. Jev slow or down? The session model keeps working.
- **Routes every step.** Before each step after the first, Jev is asked again, so a task that turned out easier or harder moves to a fitting model (the cache guard still applies). Turn it off with `routeSteps`.
- **Routes subagents.** Each subagent is routed when it is spawned, from its full task prompt, and the pick shows in the subagent list as a tag on its description (`find importers · haiku/medium`). Its steps then run on that model and effort. An explicit `model` on the Agent call wins. Turn it off with `routeSubagents`.
- **Keeps score.** `/jev status` shows how often each model was used this session.

## Does it pay off?

Two benchmarks. First, 30 single-prompt tasks: 270 calls to Jev for the picks, then 147 real runs for token usage and cost, with the effort cap at its default (`high`) and uncapped. Second, 6 multi-step tasks with tools on a fixture repo, 72 real runs, checking per prompt against every-step-and-subagent routing.

<p align="center">
  <img src="assets/fit.png" width="880" alt="Routing fit: efficient 100%, balanced 87%, cheap 66% of picks fit the task. 253 ms added per task, 97 to 100% same pick on repeat.">
</p>

<p align="center">
  <img src="assets/cost.png" width="880" alt="Cost as a percentage of always opus with the effort capped at high. Trivial tasks 3%, standard 32 to 35%, hard 143%, 124% and 44% for efficient, balanced and cheap. Overall 99%, 87% and 36%. Uncapped hard tasks cost 342%, 307% and 61%.">
</p>

| Cost vs always opus (no plugin) | efficient | balanced | cheap |
| --- | --- | --- | --- |
| Trivial tasks | -97% | -97% | -97% |
| Standard tasks | -65% | -65% | -68% |
| Hard tasks, **cap high (default)** | +43% | +24% | -56% |
| Hard tasks, uncapped | +242% | +207% | -39% |
| **All 30, cap high (default)** | **-1%** | **-13%** | **-64%** |
| All 30, uncapped | +123% | +101% | -53% |

The honest read: the model switch saves a lot on easy and mid tasks, and the default cap of `high` brings every mode to or below always-opus overall. Hard tasks still cost 24% to 43% more in `efficient` and `balanced`, because Jev picks opus there and asks for deeper reasoning. `!full` lifts the cap for one prompt when you want that. The cap changes tokens spent, not answer quality, and that is not measured.

<p align="center">
  <img src="assets/cache.png" width="880" alt="Cache guard: following every pick in a warm session costs 4735 against 1500 for always opus. With the guard it is 1500. With cold cache and tasks 400 seconds apart it is 820.">
</p>

### Multi-step tasks, with tools

<p align="center">
  <img src="assets/agentic.png" width="880" alt="Multi-step tasks with tools, cost as a percentage of always opus: always sonnet 52%, jev-router per prompt 52%, jev-router every step and subagents 47%. All strategies finished 18 of 18 tasks.">
</p>

| 6 tasks × 3 runs, real runs with tools | tasks done | cost | vs always opus | vs always sonnet |
| --- | --- | --- | --- | --- |
| no plugin: always opus | 18/18 | $2.46 | | |
| no plugin: always sonnet | 18/18 | $1.29 | -48% | |
| jev-router, per prompt | 18/18 | $1.27 | -48% | -2% |
| jev-router, every step + subagents | 18/18 | $1.15 | **-53%** | **-11%** |

Routing every step and subagent saved 11% on top of per-prompt routing. Most of that comes from one task: asked to use a subagent, it paired a sonnet main thread with a haiku subagent where per-prompt routing sometimes left the subagent on opus. On the other five tasks it matched per-prompt routing. Honest limits: these are easy tasks on a small repo, three runs each, and every strategy finished all of them, so this shows nothing was lost here, not that nothing is lost on hard work. Jev picked sonnet for nearly every one of these tasks, so against always-sonnet the gain is small.

Without the cache guard, following every pick in a long warm session cost 3x more than just using opus. Inside one long warm session the guard keeps you on the first model, so the savings above show up mostly when the cache is cold or the context is small. Method, per-tier tables and all caveats: [benchmarks/](benchmarks/README.md).

## How it works

<p align="center">
  <img src="assets/how.png" width="880" alt="How it works in five steps: a task arrives, ask Jev which model and effort, check whether the prompt cache is warm, run the turn on the pick, show it above the prompt.">
</p>

Per prompt, the mod sends Jev the routing mode, the current model, the cache state, the last few messages and the task text, and asks two choice questions: which model, and how much effort. The answer is applied to every step of that task. After each step the mod notes which model the API cached and how many tokens, so the next task knows whether a switch is worth losing the cache.

Sent to `api.typesafe.ai`: the task text, recent conversation, and subagent descriptions. Each step and subagent adds one call (about 250 ms). Your API key travels in the request header and nowhere else.

## Install

Needs a Claude Code version with mods (hooks modules) and a TypeSafe API key.

```
/plugin marketplace add dominicrico/jev-router
```
```
/plugin install jev-router@jev-router
```

Update:

```
claude plugin marketplace update jev-router
claude plugin update jev-router@jev-router
```

### API key

Any one of these, checked in this order:

1. The plugin option `apiKey` (`/config`)
2. `/jev key <key>`, stored by the mod across sessions (`/jev key clear` removes it)
3. The `TYPESAFE_API_KEY` environment variable

That was it. He'd be proud. He won't say it.

## Commands

| Command | What it does |
| --- | --- |
| `/jev` or `/jev status` | Settings, cache state, last decision and per-model usage |
| `/jev efficient \| balanced \| cheap` | Set the routing mode, from the next task |
| `/jev sticky off \| auto \| strict` | Set cache stickiness |
| `/jev cap low \| medium \| high \| xhigh \| max \| none` | Set the effort cap |
| `/jev full` | Lift the effort cap for the next prompt only |
| `/jev stats clear` | Reset the savings tally |
| `/jev on` / `/jev off` | Enable routing / use the session model |
| `/jev key <key>` | Store the TypeSafe API key |

```
┌ Jev router ────────────────────────────┐
│ state    ● on    mode  balanced        │
│ pool     haiku · sonnet · opus · fable │
│ sticky   auto   cache ● warm           │
│ last     sonnet / medium  ▮▮▮▮▯ 0.88   │
│ usage    haiku   ░░░░░░░░░░   0  0%    │
│          sonnet  ██████████   1  100%  │
│          opus    ░░░░░░░░░░   0  0%    │
│          fable   ░░░░░░░░░░   0  0%    │
│ key      …fd1c  (TYPESAFE_API_KEY)     │
└────────────────────────────────────────┘
```

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `mode` | `balanced` | Routing mode |
| `models` | all four | Aliases Jev may choose from |
| `effortCap` | `high` | Highest effort the router applies. `none` follows Jev. Per prompt: start with `!full` or run `/jev full` |
| `pauseMs` | `60000` | Stop asking Jev for this long after 3 failed calls in a row |
| `escalateAfter` | `3` | Failed tool calls in a row before the task moves up one model. `0` is off |
| `baselineModel` | `opus` | The model the savings estimate compares against |
| `sendHistory` | `true` | Send recent messages to Jev. Off sends only the task text |
| `redact` | `true` | Replace API keys, tokens, private keys and `KEY=value` lines with `[redacted]` before sending |
| `maxTaskChars` | `8000` | How much of the prompt is sent |
| `fallback` | `session` | When Jev is down: `session` keeps the session model, `heuristic` guesses locally |
| `routeSteps` | `true` | Ask Jev again before every step after the first. Off: one call per prompt |
| `routeSubagents` | `true` | Pick a model and effort for each subagent from its description |
| `stickiness` | `auto` | `off`: always follow Jev. `auto`: while the cache is warm, only upgrade on high confidence. `strict`: never switch while warm |
| `minConfidence` | `0.7` | Confidence needed for a warm-cache upgrade |
| `minContextTokens` | `8000` | Below this a switch is free and stickiness is skipped |
| `cacheTtlMs` | `300000` | Time after the last request when the cache counts as cold |
| `timeoutMs` | `4000` | Keep the current model when Jev takes longer |

## Privacy

Sent to `api.typesafe.ai`: the prompt text (up to `maxTaskChars`), recent messages if `sendHistory` is on, and subagent descriptions. Before sending, `redact` replaces API keys, GitHub tokens, AWS keys, bearer tokens, private key blocks and `NAME_KEY=value` style lines with `[redacted]`. That is pattern matching, not a guarantee, so keep `sendHistory` off if your conversations carry things it would not catch. Your TypeSafe key is stored in the plugin store in plain text if you use `/jev key`, and the command line lands in the transcript; prefer the `TYPESAFE_API_KEY` environment variable.

## FAQ

**Does it need a config file?**
No. Set a key, pick a mode, done. Everything else has a default.

**Why not just always use the best model?**
You can. `/jev efficient` and a pool of `opus` and `fable`. Your invoice will have opinions.

**Why not just always use the cheap one?**
`/jev cheap`. The hard task will have opinions.

**He kept my old model even though Jev wanted a cheaper one. Is it broken?**
No. Your cache was warm and a switch would have rewritten it. He did the maths. He was right.

**What if Jev is down?**
Then you get your session model and one polite toast. He never blocks a turn.

**Why a raccoon?**
Because he is a small creature that gets very serious about picking the right track.

## Tests

```
claude plugin validate .
claude plugin test .
```

Benchmarks: see [benchmarks/](benchmarks/README.md).

## License

[MIT](LICENSE).
