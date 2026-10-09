## 1. What it picks

Share of calls that chose each model, per mode and task tier (3 runs of each of 30 tasks).

| mode | tier | haiku | sonnet | opus | fable | typical effort |
|---|---|---|---|---|---|---|
| efficient | trivial | 100% | 0% | 0% | 0% | low |
| efficient | standard | 0% | 100% | 0% | 0% | medium |
| efficient | hard | 0% | 0% | 100% | 0% | xhigh |
| balanced | trivial | 100% | 0% | 0% | 0% | low |
| balanced | standard | 0% | 100% | 0% | 0% | medium |
| balanced | hard | 0% | 40% | 60% | 0% | xhigh |
| cheap | trivial | 100% | 0% | 0% | 0% | low |
| cheap | standard | 3% | 97% | 0% | 0% | medium |
| cheap | hard | 0% | 100% | 0% | 0% | xhigh |

## 2. Does it match the task?

**Fit**: the pick is the model an engineer would choose for that tier (trivial: haiku, standard: sonnet, hard: opus or fable). **Under**: weaker than the tier needs. **Over**: stronger than needed.

| mode | fit | under | over |
|---|---|---|---|
| efficient | 100% | 0% | 0% |
| balanced | 87% | 13% | 0% |
| cheap | 66% | 34% | 0% |

## 3. Cost against fixed-model baselines

Relative cost per task, assuming every task uses the same number of tokens (haiku 1, sonnet 3, opus 5, fable 10 per token, the last one an assumption). Lower is cheaper. "vs" is the saving against that baseline.

| strategy | cost / task | vs always opus | vs always sonnet |
|---|---|---|---|
| always haiku | 1.00 |  |  |
| always sonnet | 3.00 |  |  |
| always opus | 5.00 |  |  |
| jev-router efficient | 3.00 | 40% | 0% |
| jev-router balanced | 2.73 | 45% | 9% |
| jev-router cheap | 2.31 | 54% | 23% |

Cost per tier (efficient → trivial: 1.00, standard: 3.00, hard: 5.00 | balanced → trivial: 1.00, standard: 3.00, hard: 4.20 | cheap → trivial: 1.00, standard: 2.93, hard: 3.00).

## 4. Does it give the same answer twice?

| mode | same model on every run | same effort on every run |
|---|---|---|
| efficient | 100% | 97% |
| balanced | 100% | 100% |
| cheap | 97% | 93% |

## 5. Overhead

Time added before each task: p50 **253 ms**, p95 **314 ms**, max 397 ms over 270 calls (the mod's timeout is 4000 ms). Mean confidence: efficient 0.80, balanced 0.77, cheap 0.72.

## 6. Cache stickiness (simulation)

One session of the 30 tasks in a fixed random order, a task every 90 s, context growing 4k tokens per task from 4k. Each task uses Jev's real pick from the balanced mode. A model switch re-writes the whole context at 1.25x instead of reading it at 0.1x. **Caveat:** Jev was asked without cache info here, so in real use it also leans toward staying put; this simulation shows the mod's guard alone.

| strategy | model switches | tokens re-written | picks overridden | task cost | cache re-write cost | total |
|---|---|---|---|---|---|---|
| always sonnet (would under-serve the hard tasks) | 0 | 0k | 0 | 900 | 0 | **900** |
| always opus | 0 | 0k | 0 | 1500 | 0 | **1500** |
| routed, stickiness off | 19 | 1212k | 0 | 820 | 3915 | **4735** |
| routed, stickiness auto | 0 | 0k | 24 | 1500 | 0 | **1500** |
| routed, stickiness strict | 0 | 0k | 24 | 1500 | 0 | **1500** |
| routed, tasks 400 s apart (cache cold) | 0 | 0k | 0 | 820 | 0 | **820** |
