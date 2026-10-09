# One long session, cache warm

8 mixed tasks (3 trivial, 3 standard, 2 hard) replayed as one multi-turn conversation per strategy, tools off, 3 sessions per strategy (0 incomplete sessions left out). Each session is one long-lived Claude Code process fed one task per turn, so each turn re-reads the cache the previous one wrote and the mod keeps its state between turns. Per-turn cost and tokens are deltas of the cumulative figures Claude Code reports. A switch is two consecutive turns carried by different models (the model with the largest cost in that turn's modelUsage).

## Per strategy (means per session)

| strategy | sessions | total cost | vs always opus | model switches | cache write tokens | cache read tokens | output tokens |
|---|---|---|---|---|---|---|---|
| no plugin: always opus | 3 | $0.225 |  | 0.0 | 9.4k | 41.8k | 7.1k |
| no plugin: always sonnet | 3 | $0.093 | -59% | 0.0 | 7.8k | 36.5k | 5.4k |
| jev-router: stickiness auto | 3 | $0.216 | -4% | 4.7 | 21.4k | 28.8k | 7.0k |
| jev-router: stickiness off | 3 | $0.193 | -14% | 6.3 | 26.5k | 22.4k | 7.2k |

## Spend by model

| strategy | spend by model |
|---|---|
| no plugin: always opus | opus 100% |
| no plugin: always sonnet | sonnet 100% |
| jev-router: stickiness auto | haiku 1%, opus 83%, sonnet 17% |
| jev-router: stickiness off | haiku 1%, opus 66%, sonnet 33% |

## Model per turn, first session of each strategy

| strategy | task order | model per turn | cost per turn |
|---|---|---|---|
| no plugin: always opus | t05 h08 s01 h02 s06 s03 t02 t09 | opus opus opus opus opus opus opus opus | $0.024 $0.031 $0.029 $0.041 $0.037 $0.043 $0.020 $0.012 |
| no plugin: always sonnet | t05 h08 s01 h02 s06 s03 t02 t09 | sonnet sonnet sonnet sonnet sonnet sonnet sonnet sonnet | $0.012 $0.013 $0.013 $0.017 $0.016 $0.016 $0.008 $0.006 |
| jev-router: stickiness auto | t05 h08 s01 h02 s06 s03 t02 t09 | haiku opus sonnet opus opus opus opus opus | $0.001 $0.054 $0.027 $0.064 $0.037 $0.034 $0.016 $0.011 |
| jev-router: stickiness off | t05 h08 s01 h02 s06 s03 t02 t09 | haiku opus sonnet opus sonnet sonnet haiku haiku | $0.001 $0.052 $0.027 $0.070 $0.021 $0.016 $0.001 $0.000 |

## Per session

| strategy | session | total cost | switches | cache write | cache read |
|---|---|---|---|---|---|
| no plugin: always opus | 0 | $0.237 | 0 | 9.9k | 42.7k |
| no plugin: always opus | 1 | $0.222 | 0 | 9.5k | 40.6k |
| no plugin: always opus | 2 | $0.216 | 0 | 8.8k | 42.1k |
| no plugin: always sonnet | 0 | $0.101 | 0 | 8.5k | 39.2k |
| no plugin: always sonnet | 1 | $0.094 | 0 | 7.9k | 36.0k |
| no plugin: always sonnet | 2 | $0.084 | 0 | 7.0k | 34.4k |
| jev-router: stickiness auto | 0 | $0.245 | 3 | 16.9k | 39.1k |
| jev-router: stickiness auto | 1 | $0.197 | 5 | 20.8k | 25.6k |
| jev-router: stickiness auto | 2 | $0.208 | 6 | 26.6k | 21.6k |
| jev-router: stickiness off | 0 | $0.188 | 5 | 22.6k | 29.4k |
| jev-router: stickiness off | 1 | $0.195 | 7 | 29.2k | 18.3k |
| jev-router: stickiness off | 2 | $0.197 | 7 | 27.8k | 19.4k |
