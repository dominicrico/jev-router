# jev-router

A Claude Code mod that asks TypeSafe Jev which Claude model and reasoning effort fit each task, then runs the turn on that choice. A live band above the prompt shows what it picked.

```
◆ JEV ▏balanced▕  sonnet ▂▄__  │  medium ▰▰▱▱▱  │  conf ▮▮▮▮▯ 88%  │  cache 🔒 warm 42k
```

- Picks the model (haiku, sonnet, opus, fable) and effort (low to max) before every task
- Three routing modes: `efficient` (best result), `balanced`, `cheap` (cheapest that can succeed)
- Protects the prompt cache: while it is warm, a switch is refused unless Jev confidently asks for a stronger model
- Falls back to the session model when Jev is slow or unreachable
- Band above the prompt: mode, model tier (colour coded), effort, confidence, cache state; the mark spins while a task runs
- `/jev status` shows settings, the last decision and how often each model was used this session
- Subagent steps are never rerouted

## Install

Requires a Claude Code version with mods (hooks modules) and a TypeSafe API key.

```
/plugin marketplace add dominicrico/jev-router
/plugin install jev-router@jev-router
```

Update:

```
claude plugin marketplace update jev-router
claude plugin update jev-router@jev-router
```

## API key

Any one of these, checked in this order:

1. The plugin option `apiKey` (`/config`)
2. `/jev key <key>`, stored by the mod across sessions (`/jev key clear` removes it)
3. The `TYPESAFE_API_KEY` environment variable

## Commands

| Command | What it does |
| --- | --- |
| `/jev` or `/jev status` | Settings, cache state, last decision, per-model usage |
| `/jev efficient \| balanced \| cheap` | Set the routing mode (applies from the next task) |
| `/jev sticky off \| auto \| strict` | Set cache stickiness |
| `/jev on` / `/jev off` | Enable routing / use the session model |
| `/jev key <key>` | Store the TypeSafe API key |

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `mode` | `balanced` | Routing mode |
| `models` | all four | Aliases Jev may choose from |
| `stickiness` | `auto` | `off`: always follow Jev; `auto`: while the cache is warm only upgrade on high confidence; `strict`: never switch while warm |
| `minConfidence` | `0.7` | Confidence needed for a warm-cache upgrade |
| `minContextTokens` | `8000` | Below this a switch is free and stickiness is skipped |
| `cacheTtlMs` | `300000` | Time after the last request when the cache counts as cold |
| `timeoutMs` | `4000` | Keep the current model when Jev takes longer |

## How it works

On each new task the mod sends Jev the routing mode, the current model, the cache state, the last few messages and the task text, and asks two choice questions: which model and which effort. The answer is applied to every step of that task via `turn.step`. After each step the mod records which model the API cached and how many tokens, so the next task can decide whether switching is worth losing the cache.

Only the task text and recent conversation are sent, to `api.typesafe.ai`. The API key never leaves the request header.

## Tests

```
claude plugin validate .
claude plugin test .
```

## License

MIT
