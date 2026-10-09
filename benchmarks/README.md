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
- **Cache stickiness, simulated first, then measured.** A simulation said following every pick in a long warm session would cost 3x more than opus; the real long-session run below says +38%, so treat the simulation as an upper bound.

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

## Harder tasks, graded by hidden tests

`fixture2/` has four tasks that need real care, each graded by a **hidden test the agent never sees**: a lost-update bug in an async queue (also across two queues, with an erroring store, and with a concurrency limit), an interval merger with open and closed bounds and a random oracle, a refactor into one inventory module that must keep `0 <= reserved <= stock`, and a flaky test with three real defects. Five strategies, five runs each, 100 real runs, $10.89. Tables: [results/AGENTIC2.md](results/AGENTIC2.md).

| 4 tasks × 5 runs | tasks done | cost | vs always opus | vs always sonnet |
| --- | --- | --- | --- | --- |
| no plugin: always opus | 19/20 | $3.10 | | |
| no plugin: always sonnet | 19/20 | $1.19 | -61% | |
| jev-router, per prompt | 19/20 | $2.65 | -14% | +122% |
| jev-router, every step + subagents | 18/20 | $2.08 | -33% | +74% |
| jev-router, `!full` | 20/20 | $1.87 | -40% | +57% |
| jev-router, `ceiling: sonnet` | 20/20 | $1.56 | -50% | +31% |

- **Always sonnet matched always opus and cost 61% less.** These tasks are harder than the first set but did not need opus.
- **jev-router is cheaper than always opus but dearer than always sonnet,** because Jev put about half the spend on opus. It did not finish more tasks than sonnet alone.
- **The quality differences are noise.** 18, 19 and 20 of 20 differ by at most two runs; at 5 runs per cell that says nothing. Note `!full` (cap lifted) finishing 20/20 is one run more than the others and not evidence that the cap hurts.
- **How the hidden tests are protected.** A first run of this benchmark was thrown away: a headless agent could read the hidden tests from disk by path (tested, `Read` works anywhere). They and the reference solutions are now sealed in `fixture2/sealed.tgz` and unpacked into a random temp directory only while grading; `node fixture2/verify.mjs` still checks every hidden test fails on the untouched fixture and passes with the reference. Anyone can unseal them (`node fixture2/seal.mjs unseal <dir>`): this guards the runs, not secrecy.

## Long sessions: the cache guard, measured

Finding the right way to measure it took two probes. `claude -p --resume` per turn does **not** keep the mod's state (the second turn logged `cache none`), so the cache guard would never engage; and `total_cost_usd` and `modelUsage` on a resumed turn are cumulative. A single process fed through `--input-format stream-json` does keep the state, so `session.mts` runs each session as one long-lived process, one task per turn, and records per-turn deltas. Run with `CONTEXT=repo` the first turn also carries about 20k tokens of source so contexts are large.

Short contexts first (5 to 10k tokens, `results/SESSION.md`): always opus $0.225 per session, always sonnet $0.093, guard on $0.216 (4.7 switches), guard off $0.193 (6.3 switches). The guard is below its 8,000-token threshold for much of these, switches cost little, and keeping the guard on actually cost slightly more because it held the session on opus.

Long contexts (`results/SESSION-LONG.md`, 3 sessions per strategy, 12 complete sessions, $6.32):

| Mean per session | cost | vs always opus | model switches | cache write tokens | cache read tokens |
| --- | --- | --- | --- | --- | --- |
| always opus | $0.506 | | 0 | 41.7k | 285.6k |
| always sonnet | $0.273 | -46% | 0 | 41.0k | 283.0k |
| jev-router, guard on (`auto`) | $0.627 | +24% | 1.0 | 78.4k | 247.9k |
| jev-router, guard off | $0.699 | +38% | 6.3 | 193.8k | 131.6k |

- **The guard does what it says:** switches 6.3 to 1.0, cache re-writes 194k to 78k tokens, cost +38% to +24% against opus.
- **But routing lost to staying on one model** in a long warm session, in both strategies. The savings in the other benchmarks come from easy tasks and cold or small contexts.
- **Caveats:** tools off, 8 short tasks, 3 sessions per strategy, one fixture of context. A real session has tool results growing the context, which would make switches dearer still.

## Ceiling

`ceiling: sonnet` was added after the hard-task result and run on the same four sealed tasks, 5 runs: 20/20 done for $1.56 (-50% against opus, +31% against always-sonnet), spend 100% sonnet. It finished the most tasks of any strategy, but 20 against 19 is one run and not evidence of anything. Its cost is above always-sonnet's $1.19 because Jev still asks for a higher effort than sonnet's default (capped at `high`).

## Verified live

Headless `claude -p` runs with the mod loaded and `--debug-file`, reading the mod's own debug lines (`jev prompt|step N|agent <type>`):

- A subagent's description **is** available before its first step: the log shows `jev agent Explore: Find pricing.js importers and rounding: haiku/medium`. Subagent routing works as designed.
- A background-task notification **does** start a turn with text. It used to cost a Jev call and overwrite the task text, so the mod now ignores turns whose prompt origin is `task-notification`.
- A failing `Bash` call **does** come back with `isError`, so escalation fires: three failed calls logged `jev escalate: haiku -> sonnet after 3 failed tool calls`.

## Limits, said plainly

- **Not measured: whether the answer was better.** The token runs are one run per task and strategy, no tools, in an empty directory, so a task that asks for "attached" files gets a plan instead of an edit. They measure how much each model and effort spends, not how good the result is.
- **Quality is measured only in the two tool-using benchmarks.** The single-prompt benchmark measures what Jev picks and what it costs, not whether the answer was good; "fit" there is against the author's tier labels. Task success is measured on the fixture repos, at 3 to 5 runs per cell.
- 30 synthetic single-prompt tasks and 6 multi-step tasks on one tiny fixture repo, all written by one person. Real work is messier. The multi-step runs are 3 per cell, so small differences are noise.
- The relative-unit costs come from the mod's own multipliers (haiku 1x, sonnet 3x, opus 5x). Fable has no stated multiplier, so 10x is an assumption (it does not change the numbers above, no hard task landed on fable). Every task is assumed to use the same number of tokens, and a cache re-write is priced at 1.25x against 0.1x for a read. Change `W` and the constants in `analyze.mts` to match your own bill.
- The cache simulation sent Jev no cache info, so in real use Jev also leans toward staying on the current model. The simulation shows the mod's own guard in isolation.
- Jev is a hosted service and may change. Re-run `collect.mts` to refresh.
