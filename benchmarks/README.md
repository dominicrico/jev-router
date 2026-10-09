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
| Cost per task, always opus = 5.00 | 3.00 (-40%) | 2.73 (-45%) | 2.31 (-54%) |
| Cost per task, always sonnet = 3.00 | 0% | -9% | -23% |
| Same model on every repeat | 100% | 100% | 97% |

- **Routing follows the task.** Trivial tasks went to haiku on every call and standard tasks to sonnet, in all three modes. In `efficient` every hard task went to opus.
- **The modes are a real dial.** `balanced` sends some hard tasks (40%) to sonnet to save money; `cheap` sends all of them there, which is why a third of its picks are under-served. Use `cheap` for work where a miss is cheap.
- **It is stable.** The same task got the same model on 97% to 100% of repeats.
- **It is fast.** Asking Jev adds about 250 ms before a task (p95 314 ms, max 397 ms; the mod's timeout is 4000 ms).
- **Switching models is expensive in a long session, so the cache guard matters.** In a simulated session of 30 mixed tasks with a warm, growing cache, following every Jev pick (`stickiness off`) switched models 19 times and re-wrote 1.2M tokens, a total cost 3x above just using opus the whole time. With the guard (`auto` or `strict`) there are no switches.
- **The savings land where the cache is cold.** With tasks more than five minutes apart (or fresh contexts), routing costs 820 against 1500 for always opus: 45% less. Inside one warm, long session the guard keeps you on the first model, so you pay what that model costs and nothing worse.

## Limits, said plainly

- **Not measured: whether the cheaper model succeeded.** This benchmark measures what Jev picks, not whether haiku or sonnet then solved the task. "Fit" is against the author's tier labels, so it checks agreement with a reasonable engineer, not task success.
- 30 synthetic tasks, written by one person. Real work is messier.
- Costs are relative units from the mod's own multipliers (haiku 1x, sonnet 3x, opus 5x). Fable has no stated multiplier, so 10x is an assumption (it does not change the numbers above, no hard task landed on fable). Every task is assumed to use the same number of tokens, and a cache re-write is priced at 1.25x against 0.1x for a read. Change `W` and the constants in `analyze.mts` to match your own bill.
- The cache simulation sent Jev no cache info, so in real use Jev also leans toward staying on the current model. The simulation shows the mod's own guard in isolation.
- Jev is a hosted service and may change. Re-run `collect.mts` to refresh.
