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

The relative-unit costs above assume every strategy spends the same number of tokens. That is not true, so we also ran all 30 tasks headless on the model and effort each strategy uses and recorded real usage: 131 runs, 0 errors. No plugin means a fixed model at its default effort. The router runs use the model and effort Jev picked. Tables: [results/TOKENS.md](results/TOKENS.md).

| Total over 30 tasks | output tokens | cost | vs always opus | vs always sonnet |
| --- | --- | --- | --- | --- |
| no plugin: always opus | 50.0k | $1.16 | | |
| no plugin: always sonnet | 35.0k | $0.44 | -62% | |
| jev-router efficient | 134.0k | $2.59 | **+123%** | +491% |
| jev-router balanced | 125.5k | $2.34 | **+101%** | +434% |
| jev-router cheap | 53.5k | $0.54 | **-53%** | +25% |

By tier, cost against always opus:

| | trivial | standard | hard |
| --- | --- | --- | --- |
| efficient | -97% | -65% | **+242%** |
| balanced | -97% | -65% | **+207%** |
| cheap | -97% | -68% | -39% |

- **Easy and mid tasks are where it saves.** Trivial tasks cost 97% less than opus and standard tasks 65% less, with about the same output tokens. That is the model switch alone.
- **Hard tasks cost more, because of effort.** For hard tasks Jev asks for `xhigh` effort, which makes the model think longer: opus used 121k output tokens at that effort against 34k at its default. Holding effort equal, `efficient` costs the same as opus on hard tasks (it picks opus), so the extra spend is the reasoning depth, not the routing. Whether that deeper reasoning produces better answers is not measured here.
- **So only `cheap` is cheaper overall.** `efficient` and `balanced` spend about twice what always-opus-at-default does, because they buy more reasoning on the hard tasks. `cheap` sends hard tasks to sonnet and ends 53% below opus, and 25% above plain sonnet.
- **Sonnet at `xhigh` beat opus at `xhigh` on cost.** On hard tasks `cheap` (sonnet) used 41k output tokens against 118k for opus at the same effort.

The mod now has an `effortCap` option (default `high`) for exactly this, and `!full` to lift it for one prompt. These measurements were taken with the cap off (`none`); they have not been re-run with the cap on.

## Limits, said plainly

- **Not measured: whether the answer was better.** The token runs are one run per task and strategy, no tools, in an empty directory, so a task that asks for "attached" files gets a plan instead of an edit. They measure how much each model and effort spends, not how good the result is.
- **Not measured: whether the cheaper model succeeded.** This benchmark measures what Jev picks, not whether haiku or sonnet then solved the task. "Fit" is against the author's tier labels, so it checks agreement with a reasonable engineer, not task success.
- 30 synthetic tasks, written by one person. Real work is messier.
- The relative-unit costs come from the mod's own multipliers (haiku 1x, sonnet 3x, opus 5x). Fable has no stated multiplier, so 10x is an assumption (it does not change the numbers above, no hard task landed on fable). Every task is assumed to use the same number of tokens, and a cache re-write is priced at 1.25x against 0.1x for a read. Change `W` and the constants in `analyze.mts` to match your own bill.
- The cache simulation sent Jev no cache info, so in real use Jev also leans toward staying on the current model. The simulation shows the mod's own guard in isolation.
- Jev is a hosted service and may change. Re-run `collect.mts` to refresh.
