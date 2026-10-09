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
  <img src="assets/hero.jpg" width="880" alt="A raccoon switchman at a track junction sends a little train to one of four stations: a green hut, a blue house, a purple tower or a gold castle.">
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
- **Never blocks you.** Jev slow or down? The session model keeps working.
- **Leaves subagents alone.** Only the main thread is rerouted.
- **Keeps score.** `/jev status` shows how often each model was used this session.

## Does it pay off?

Benchmarked on 30 tasks: 270 calls to Jev for the picks, then 131 real runs for token usage and cost.

<p align="center">
  <img src="assets/fit.png" width="880" alt="Routing fit: efficient 100%, balanced 87%, cheap 66% of picks fit the task. 253 ms added per task, 97 to 100% same pick on repeat.">
</p>

<p align="center">
  <img src="assets/cost.png" width="880" alt="Cost as a percentage of always opus. Trivial tasks cost 3%, standard 32 to 35%, hard tasks 342%, 307% and 61% for efficient, balanced and cheap. Overall 223%, 201% and 47%.">
</p>

The honest read: the model switch saves a lot on easy and mid tasks. On hard tasks Jev also asks for `xhigh` effort, so `efficient` and `balanced` spend more tokens thinking than opus at its default, which is deeper reasoning rather than savings. Only `cheap` is cheaper overall.

<p align="center">
  <img src="assets/cache.png" width="880" alt="Cache guard: following every pick in a warm session costs 4735 against 1500 for always opus. With the guard it is 1500. With cold cache and tasks 400 seconds apart it is 820.">
</p>

Without the cache guard, following every pick in a long warm session cost 3x more than just using opus. This measures spend, not answer quality. Method, per-tier tables and all caveats: [benchmarks/](benchmarks/README.md).

## How it works

<p align="center">
  <img src="assets/how.png" width="880" alt="How it works in five steps: a task arrives, ask Jev which model and effort, check whether the prompt cache is warm, run the turn on the pick, show it above the prompt.">
</p>

On each new task the mod sends Jev the routing mode, the current model, the cache state, the last few messages and the task text, and asks two choice questions: which model, and how much effort. The answer is applied to every step of that task. After each step the mod notes which model the API cached and how many tokens, so the next task knows whether a switch is worth losing the cache.

Sent to `api.typesafe.ai`: the task text and recent conversation. Your API key travels in the request header and nowhere else.

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
| `stickiness` | `auto` | `off`: always follow Jev. `auto`: while the cache is warm, only upgrade on high confidence. `strict`: never switch while warm |
| `minConfidence` | `0.7` | Confidence needed for a warm-cache upgrade |
| `minContextTokens` | `8000` | Below this a switch is free and stickiness is skipped |
| `cacheTtlMs` | `300000` | Time after the last request when the cache counts as cold |
| `timeoutMs` | `4000` | Keep the current model when Jev takes longer |

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
