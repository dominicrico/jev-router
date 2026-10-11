<p align="center">
  <img src="assets/logo.jpg" width="200" alt="Jev Router, the smug switchman raccoon">
</p>

<h1 align="center">jev-router: automatic Claude model routing for Claude Code</h1>

<p align="center">
  <em>Stop paying Opus prices for rename-a-variable work. Right model, right effort, every prompt, step and subagent.</em>
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
  <a href="https://dominicrico.github.io/jev-router/">Website</a> ·
  <a href="#install-the-claude-code-plugin">Install</a> ·
  <a href="#does-it-reduce-claude-code-costs">Proof</a> ·
  <a href="#faq">FAQ</a> ·
  <a href="OPTIONS.md">Reference</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

**jev-router is a free Claude Code plugin that sends each prompt, step and subagent to the cheapest Claude model that can do the job** (Haiku, Sonnet, Opus, Fable), caps runaway reasoning effort, and shows you every pick in a live band above your prompt. No config needed.

## Install the Claude Code plugin

```
/plugin marketplace add dominicrico/jev-router
/plugin install jev-router@jev-router
```

Then `/jev key <your TypeSafe key>` (or set `TYPESAFE_API_KEY`) and run `/jev status`. That is the whole setup: the `lean` preset is on by default.

<p align="center">
  <img src="assets/benefits.png" width="880" alt="Measured against always using Opus: minus 97 percent on small tasks, minus 65 percent on everyday work, minus 61 percent on hard tasks with 39 of 40 done, minus 56 percent on agent runs with subagents with 18 of 18 done.">
</p>

## See every pick, live

<p align="center">
  <img src="assets/band.gif" width="880" alt="The band above the prompt stepping through its states: idle, running, haiku, sonnet, capped opus, ceiling, pinned, escalated, paused, off.">
</p>

## What you get

<p align="center">
  <img src="assets/features.png" width="880" alt="Nine features: right model per prompt, re-routes every step, routes subagents, effort cap, Sonnet ceiling, cache guard, live band, per-prompt control, privacy controls.">
</p>

<p align="center">
  <img src="assets/how.png" width="880" alt="How it works in six steps: a task arrives, ask Jev, check the cache, cap the effort, re-ask each step and route subagents, show it above the prompt.">
</p>

## Does it reduce Claude Code costs?

Yes, on most work, and the benchmarks say where it does not. Every number is a real Claude Code run (hard tasks are graded by hidden tests the agent never sees), and the raw runs are in the repo.

<p align="center">
  <img src="assets/hard.png" width="880" alt="Harder tasks graded by hidden tests, mean cost per run as a percentage of always opus: always sonnet 38 percent, jev-router lean 39 percent with 39 of 40 done.">
</p>

## Is it for you?

<p align="center">
  <img src="assets/fitfor.png" width="880" alt="Great for Opus-by-default users, many small tasks, agent runs with subagents and anyone who wants to see which model runs. Skip it if plain Sonnet already does all your work or you live in one huge warm session.">
</p>

Long warm sessions are the honest weak spot: the cache guard cuts model switches from 6 to 1 and halves cache re-writes, but the bill stayed the same, and `lean` averaged Opus cost there while plain Sonnet was 43% cheaper. See the chart:

<p align="center">
  <img src="assets/cache.png" width="880" alt="Measured long sessions, 5 per strategy: always opus 48 cents, always sonnet 27, jev-router balanced with and without the cache guard 67 and 68, lean 48 with a range of 26 to 63 cents.">
</p>

## Commands

<p align="center">
  <img src="assets/commands.png" width="880" alt="Cheat sheet: /jev status, /jev preset, /jev ceiling, /jev cap, /jev full, /jev key, and the prompt markers !opus, !sonnet, !haiku, !full, !cheap.">
</p>

Every option, preset, command and the privacy details are in [OPTIONS.md](OPTIONS.md). Method, per-benchmark results and caveats are in [benchmarks/](benchmarks/README.md).

## FAQ

**How do I switch between Opus, Sonnet and Haiku automatically in Claude Code?** Install jev-router; it picks per prompt, again before each step, and once per subagent. Pin one prompt with `!opus`, `!sonnet` or `!haiku`.

**How do I reduce Claude Code token cost?** Send easy tasks to cheaper models and cap the reasoning effort. jev-router does both (small tasks −97%, everyday −65% against always Opus). If plain Sonnet already does your work, use that: it was cheapest on the hard set.

**What is the effort cap?** Jev often asks for `xhigh` reasoning on hard tasks, which can triple the tokens. The default `lean` preset limits effort to `medium`; `!full` lifts it for one prompt.

**Does it send my code to a third party?** The prompt, optionally recent messages, and subagent task text go to `api.typesafe.ai`. Keys, tokens, private keys and `password=` style values are redacted first, and `sendHistory` can turn the history off. Details in [OPTIONS.md](OPTIONS.md#privacy).

**Will it slow Claude Code down?** Each Jev call adds about 250 ms; after three failures in a row it pauses for a minute and keeps your current model.

**Why a raccoon?** He is a small creature that gets very serious about picking the right track.

## License

[MIT](LICENSE). Not affiliated with Anthropic or TypeSafe. Security issues: see [SECURITY.md](SECURITY.md).

<sub>Keywords: Claude Code plugin, Claude model router, Claude Code cost optimization, Opus Sonnet Haiku switching, Claude Code subagents, prompt cache, reasoning effort, LLM routing.</sub>
