# Benchmarks

Does routing each task to a model beat picking one model and staying on it? Everything here is reproducible: `cases.json` holds the tasks, `collect.mts` asks Jev with the exact request the mod sends, `analyze.mts` turns the answers into [results/RESULTS.md](results/RESULTS.md). The raw answers are in [results/raw.json](results/raw.json).

## Cases

30 coding tasks, 10 per tier. The tier is the author's judgement of what a senior engineer would reach for:

| Tier | Fits | Examples |
| --- | --- | --- |
| trivial | haiku | rename a variable, fix a typo, bump a version |
| standard | sonnet | add an endpoint with a test, fix a time zone bug, write a migration |
| hard | opus or fable | sharded job queue, double-charge root cause, JWT migration across four apps |

Each task is sent in the three routing modes, three times each: 270 calls, 0 errors.

## Run it

```
export TYPESAFE_API_KEY=...
npx tsx --tsconfig benchmarks/tsconfig.json benchmarks/collect.mts 3   # 270 calls to Jev
npx tsx --tsconfig benchmarks/tsconfig.json benchmarks/analyze.mts     # no network
```

## What the numbers say

Full tables in [results/RESULTS.md](results/RESULTS.md).

| | efficient | balanced | cheap |
| --- | --- | --- | --- |
| Picks the model that fits the task | **100%** | **87%** | 66% |
| Under-served (weaker than the task needs) | 0% | 13% | 34% |
| Model price per task vs always opus (relative units, equal tokens assumed, **ignores effort**) | -40% | -45% | -54% |
| Same model on every repeat | 100% | 100% | 97% |

- **Routing follows the task.** Trivial tasks went to haiku on every call and standard tasks to sonnet, in all three modes. In `efficient` every hard task went to opus.
- **The modes are a real dial.** `balanced` sends some hard tasks (40%) to sonnet to save money; `cheap` sends all of them there, which is why a third of its picks are under-served. Use `cheap` for work where a miss is cheap.
- **It is stable.** The same task got the same model on 97% to 100% of repeats.
- **It is fast.** Asking Jev adds about 250 ms before a task (p95 314 ms, max 397 ms; the mod's timeout is 4000 ms).
- **Switching models is expensive in a long session, so the cache guard matters.** In a simulated session of 30 mixed tasks with a warm, growing cache, following every Jev pick (`stickiness off`) switched models 19 times and re-wrote 1.2M tokens, a total cost 3x above just using opus the whole time. With the guard (`auto` or `strict`) there are no switches.
- **The savings land where the cache is cold.** With tasks more than five minutes apart (or fresh contexts), routing costs 820 against 1500 for always opus: 45% less. Inside one warm, long session the guard keeps you on the first model, so you pay what that model costs and nothing worse.

## Measured tokens and cost

The relative-unit costs above assume every strategy spends the same number of tokens. That is not true, so we also ran all 30 tasks headless on the model and effort each strategy uses and recorded real usage: 147 runs, 0 errors. No plugin means a fixed model at its default effort. The router runs use the model Jev picked with either its effort as asked (uncapped) or capped at `high`, the default. Tables: [results/TOKENS.md](results/TOKENS.md).

| Total over 30 tasks | output tokens | cost | vs always opus | vs always sonnet |
| --- | --- | --- | --- | --- |
| no plugin: always opus | 50.0k | $1.16 | | |
| no plugin: always sonnet | 35.0k | $0.44 | -62% | |
| jev-router efficient, cap high (default) | 62.1k | $1.15 | **-1%** | +163% |
| jev-router balanced, cap high (default) | 59.1k | $1.01 | **-13%** | +132% |
| jev-router cheap, cap high (default) | 41.1k | $0.42 | **-64%** | -4% |
| jev-router efficient, uncapped | 134.0k | $2.59 | +123% | +491% |
| jev-router balanced, uncapped | 125.5k | $2.34 | +101% | +434% |
| jev-router cheap, uncapped | 53.5k | $0.54 | -53% | +25% |

By tier, cost against always opus:

| | trivial | standard | hard, cap high | hard, uncapped |
| --- | --- | --- | --- | --- |
| efficient | -97% | -65% | +43% | +242% |
| balanced | -97% | -65% | +24% | +207% |
| cheap | -97% | -68% | -56% | -39% |

- **Easy and mid tasks are where it saves.** Trivial tasks cost 97% less than opus and standard tasks 65% less, with about the same output tokens. That is the model switch alone, and the cap does not touch it.
- **Hard tasks are where the effort cap matters.** Uncapped, Jev asks for `xhigh` effort and opus used 121k output tokens at that effort against 34k at its default. Capped at `high`, `efficient` hard tasks drop from +242% to +43%, and from +207% to +24% for `balanced`.
- **With the default cap no mode costs more than always opus overall.** `efficient` lands about level (-1%), `balanced` 13% below, `cheap` 64% below and 4% below plain sonnet.
- **Sonnet beat opus on cost for the same effort.** On hard tasks `cheap` (sonnet) used far fewer tokens than opus at the same effort.

`!full` (or `/jev full`) lifts the cap for one prompt when a task deserves the deeper reasoning. Whether deeper reasoning gives a better answer is not measured here.

## Multi-step tasks with tools

The single-prompt runs cannot say anything about re-routing every step or routing subagents, so `agentic.mts` runs six tasks on a small fixture repo (`fixture/`, a cart library with one failing test and one hidden bug): a rename, a bug fix, a feature with a coupon rule, a survey that asks for a subagent, a refactor and a root-cause hunt. Each runs under four strategies, three times each, as real headless Claude Code with tools: always opus, always sonnet, jev-router with one call per prompt (`routeSteps` and `routeSubagents` off), and jev-router with both on (the default). A script checks each task was really done (tests pass, the fix works, the files exist), so this one also measures whether the work got done. Tables: [results/AGENTIC.md](results/AGENTIC.md).

| 6 tasks × 3 runs | tasks done | cost | vs always opus | vs always sonnet |
| --- | --- | --- | --- | --- |
| no plugin: always opus | 18/18 | $2.46 | | |
| no plugin: always sonnet | 18/18 | $1.29 | -48% | |
| jev-router, per prompt | 18/18 | $1.27 | -48% | -2% |
| jev-router, every step + subagents | 18/18 | $1.15 | **-53%** | **-11%** |

- **Nothing was lost on these tasks.** All four strategies finished 18 of 18.
- **Per-step and subagent routing saved 11% more than per-prompt routing.** Most of it is the subagent task, where it ran a sonnet main thread with a haiku subagent for $0.14 over three runs, against $0.27 for per-prompt routing and $0.60 for always opus. On the other five tasks the two routing modes cost about the same.
- **Jev chose sonnet for almost everything here,** because the tasks are small. So the saving against always-sonnet is modest, and a fixture of harder tasks might show something different. That is not measured.

```
npx tsx --tsconfig benchmarks/tsconfig.json benchmarks/agentic.mts 3   # real runs, costs money
npx tsx --tsconfig benchmarks/tsconfig.json benchmarks/agentic-analyze.mts
```

## Verified live

Headless `claude -p` runs with the mod loaded and `--debug-file`, reading the mod's own debug lines (`jev prompt|step N|agent <type>`):

- A subagent's description **is** available before its first step: the log shows `jev agent Explore: Find pricing.js importers and rounding: haiku/medium`. Subagent routing works as designed.
- A background-task notification **does** start a turn with text. It used to cost a Jev call and overwrite the task text, so the mod now ignores turns whose prompt origin is `task-notification`.
- A failing `Bash` call **does** come back with `isError`, so escalation fires: three failed calls logged `jev escalate: haiku -> sonnet after 3 failed tool calls`.

## Limits, said plainly

- **Not measured: whether the answer was better.** The token runs are one run per task and strategy, no tools, in an empty directory, so a task that asks for "attached" files gets a plan instead of an edit. They measure how much each model and effort spends, not how good the result is.
- **Not measured: whether the cheaper model succeeded.** This benchmark measures what Jev picks, not whether haiku or sonnet then solved the task. "Fit" is against the author's tier labels, so it checks agreement with a reasonable engineer, not task success.
- 30 synthetic single-prompt tasks and 6 multi-step tasks on one tiny fixture repo, all written by one person. Real work is messier. The multi-step runs are 3 per cell, so small differences are noise.
- The relative-unit costs come from the mod's own multipliers (haiku 1x, sonnet 3x, opus 5x). Fable has no stated multiplier, so 10x is an assumption (it does not change the numbers above, no hard task landed on fable). Every task is assumed to use the same number of tokens, and a cache re-write is priced at 1.25x against 0.1x for a read. Change `W` and the constants in `analyze.mts` to match your own bill.
- The cache simulation sent Jev no cache info, so in real use Jev also leans toward staying on the current model. The simulation shows the mod's own guard in isolation.
- Jev is a hosted service and may change. Re-run `collect.mts` to refresh.
