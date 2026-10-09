# Changelog

All notable changes to jev-router are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/).

## [0.2.0] - Unreleased

### Added
- Per-step routing: Jev is asked again before every step of a task, not only at the prompt (`routeSteps`).
- Per-subagent routing: each subagent is routed once from its description (`routeSubagents`).
- Effort cap, `high` by default, so the `xhigh`/`max` that Jev suggests on hard tasks no longer drives cost above always-opus. Lift it for one prompt with a `!full` prefix or `/jev full`; change it with `/jev cap <effort|none>` or the `effortCap` option. The band shows the cap (`⤓xhigh`) and the unlock (`🔓`).
- Circuit breaker: three failed Jev calls in a row pause routing, then it recovers; strict stickiness with a warm cache makes no step calls.
- Benchmarks for the effort cap and for multi-step and subagent routing on tasks with tools, with updated README images.

### Changed
- Ponytail cleanup pass over the hook module.

### Fixed
- Spinner leak: the band ticker now stops on `turn.complete` and on `/jev` commands, and cancels itself if a prompt never completes.

## [0.1.0]

### Added
- Jev routing per prompt: before each task, ask TypeSafe Jev which Claude model and effort fit best, then run the turn on it. Modes: `efficient`, `balanced`, `cheap`.
- The band above the prompt: mode, model tier, effort, confidence and cache state, with a spinner while a task runs.
- `/jev` commands: `efficient`, `balanced`, `cheap`, `sticky`, `on`, `off`, `status`, `key`.
- Cache stickiness (`auto`, `strict`, `off`): while the prompt cache is warm, a downgrade is refused and an upgrade needs a confident pick, so routing does not throw away a cache it would pay to rebuild.
- Benchmarks: routing fit, cost, stability, overhead and cache stickiness over 30 tasks, plus real token usage and cost per mode against no plugin.
- Ponytail-style README with logo, hero art and benchmark charts.

[0.2.0]: https://github.com/dominicrico/jev-router/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/dominicrico/jev-router/releases/tag/v0.1.0
