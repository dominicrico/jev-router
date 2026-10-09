# Changelog

All notable changes to jev-router are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-10-09

### Added
- Per-step routing: Jev is asked again before every step of a task, not only at the prompt (`routeSteps`).
- Per-subagent routing: each subagent is routed at spawn from its full task prompt, sets the subagent's model and tags its description in the subagent list (`routeSubagents`). Verified live.
- Effort cap, `high` by default, so the `xhigh`/`max` that Jev suggests on hard tasks no longer drives cost above always-opus. Lift it for one prompt with a `!full` prefix or `/jev full`; change it with `/jev cap <effort|none>` or the `effortCap` option. The band shows the cap (`⤓xhigh`) and the unlock (`🔓`).
- Circuit breaker: three failed Jev calls in a row pause routing, then it recovers; strict stickiness with a warm cache makes no step calls.
- Per-prompt markers: `!opus`, `!sonnet`, `!haiku`, `!fable` pin a model and skip Jev; `!cheap`, `!efficient` set the mode; they combine with `!full`.
- Escalation: after `escalateAfter` failed tool calls in a row the rest of the task moves up one model (verified live).
- Estimated savings tally in `/jev status` against `baselineModel`, kept across sessions; `/jev stats clear` resets it.
- Privacy: `redact` (on by default), `sendHistory`, `maxTaskChars`, and an opt-in local `fallback: heuristic` when Jev is down.
- A debug log line per Jev call (`jev prompt|step N|agent`), used to verify the above live.
- CI workflow, band render test and an animated band GIF.
- Benchmark on harder tasks graded by hidden tests (100 real runs). On those tasks plain sonnet did as well as opus and cost 61% less; jev-router sits between them.
- Benchmarks for the effort cap and for multi-step and subagent routing on tasks with tools, with updated README images.

### Changed
- Ponytail cleanup pass over the hook module: one subagent router, one usage tally (steps per model, in `/jev status`), shared benchmark helpers, and the band GIF now renders the real `segments()` so it cannot drift.

### Fixed
- Secret redaction now catches lowercase names (`password=`, `client_secret:`, `api_key=`), JSON keys (`"apiKey": "..."`) and `user:password@` in URLs, and no longer mangles type words like `token: string`.
- A pinned model (`!opus`) now works without a Jev key, and the marker no longer sticks to the next prompt. A prompt with no key no longer runs on the previous task's pick.
- The hard-task benchmark's hidden tests and reference solutions are sealed in an archive and unpacked only into a random temp directory while grading, so an agent cannot read them from disk. (A first run was discarded because they were readable.)
- Background-task notifications no longer trigger a Jev call or overwrite the task text.
- Spinner leak: the band ticker now stops on `turn.complete` and on `/jev` commands, and cancels itself if a prompt never completes.

## [0.1.0]

### Added
- Jev routing per prompt: before each task, ask TypeSafe Jev which Claude model and effort fit best, then run the turn on it. Modes: `efficient`, `balanced`, `cheap`.
- The band above the prompt: mode, model tier, effort, confidence and cache state, with a spinner while a task runs.
- `/jev` commands: `efficient`, `balanced`, `cheap`, `sticky`, `on`, `off`, `status`, `key`.
- Cache stickiness (`auto`, `strict`, `off`): while the prompt cache is warm, a downgrade is refused and an upgrade needs a confident pick, so routing does not throw away a cache it would pay to rebuild.
- Benchmarks: routing fit, cost, stability, overhead and cache stickiness over 30 tasks, plus real token usage and cost per mode against no plugin.
- Ponytail-style README with logo, hero art and benchmark charts.

[0.2.0]: https://github.com/dominicrico/jev-router/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/dominicrico/jev-router/releases/tag/v0.1.0
