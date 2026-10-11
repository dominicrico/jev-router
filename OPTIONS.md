# jev-router reference

Commands, options, presets and privacy. For the overview, benchmarks and install, see the [README](README.md).

## Presets

| Preset | ceiling | effort cap | mode | for |
| --- | --- | --- | --- | --- |
| `lean` (default) | sonnet (Opus only at 90% confidence) | medium | balanced | most work: small tasks on Haiku, the rest on Sonnet |
| `balanced` | none | high | balanced | the 0.2 and 0.3 behaviour |
| `max` | none | none | efficient | when quality matters more than cost |


`/jev preset <name>` switches for the session; the `preset` option sets it permanently. `/jev ceiling`, `/jev cap` and the other commands still override one setting. The default is `lean` (the shipped option values are the lean ones; CI checks that they match).

## The band

| Part | Meaning |
| --- | --- |
| `balanced` | Routing mode: `efficient`, `balanced` or `cheap` |
| `sonnet ▂▄__` | The model the task runs on, with its tier. Green haiku, blue sonnet, purple opus, gold fable |
| `medium ▰▰▱▱▱` | Reasoning effort, `low` to `max` |
| `conf ▮▮▮▮▯ 88%` | How sure Jev is. Green from 70%, amber from 50%, red below |
| `cache 🔒 warm 42k` | Whether the prompt cache is still worth protecting, and how big it is |


When the cache wins, the band says so: `opus (kept 🔒 cache warm; wanted haiku)`. A model that differs from the pick reads `sonnet (picked opus)`; `⤓xhigh` means the effort cap lowered Jev's effort; `🔓` means the prompt ran uncapped; `↑` escalation; `📌` pinned; `⤒opus` clamped by the ceiling.

## Commands

| Command | What it does |
| --- | --- |
| `/jev` or `/jev status` | Settings, cache state, last decision and per-model usage |
| `/jev efficient \| balanced \| cheap` | Set the routing mode, from the next task |
| `/jev sticky off \| auto \| strict` | Set cache stickiness |
| `/jev cap low \| medium \| high \| xhigh \| max \| none` | Set the effort cap |
| `/jev preset lean\|balanced\|max` | Switch the ceiling, effort cap and mode together |
| `/jev ceiling <model\|none>` | Never go above this model unless Jev is very sure |
| `/jev floor <model\|none>` | Never go below this model |
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
| `preset` | `none` | `lean`, `balanced` or `max` overrides the three options below. `none`: the options apply as set (the shipped defaults are the `lean` values) |
| `effortCap` | `medium` | Highest effort the router applies. `none` follows Jev. Per prompt: start with `!full` or run `/jev full` |
| `ceiling` | `sonnet` | Highest model Jev may pick unless it is `ceilingBreak` sure (`haiku`, `sonnet`, `opus`, `fable`) |
| `floor` | `none` | Lowest model Jev may pick |
| `ceilingBreak` | `0.9` | Confidence needed to exceed the ceiling |
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

