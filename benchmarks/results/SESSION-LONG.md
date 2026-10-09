# One long session, cache warm

8 mixed tasks (3 trivial, 3 standard, 2 hard) replayed as one multi-turn conversation per strategy, tools off, 3 sessions per strategy (0 incomplete sessions left out). Each session is one long-lived Claude Code process fed one task per turn, so each turn re-reads the cache the previous one wrote and the mod keeps its state between turns. Per-turn cost and tokens are deltas of the cumulative figures Claude Code reports. A switch is two consecutive turns carried by different models (the model with the largest cost in that turn's modelUsage).

## Per strategy (means per session)

| strategy | sessions | total cost | vs always opus | model switches | cache write tokens | cache read tokens | output tokens |
|---|---|---|---|---|---|---|---|
| no plugin: always opus | 3 | $0.506 |  | 0.0 | 41.7k | 285.6k | 5.8k |
| no plugin: always sonnet | 3 | $0.273 | -46% | 0.0 | 41.0k | 283.0k | 5.3k |
| jev-router: stickiness auto | 3 | $0.627 | +24% | 1.0 | 78.4k | 247.9k | 5.6k |
| jev-router: stickiness off | 3 | $0.699 | +38% | 6.3 | 193.8k | 131.6k | 6.4k |

## Spend by model

| strategy | spend by model |
|---|---|
| no plugin: always opus | opus 100% |
| no plugin: always sonnet | sonnet 100% |
| jev-router: stickiness auto | sonnet 28%, opus 72% |
| jev-router: stickiness off | sonnet 44%, opus 54%, haiku 3% |

## Model per turn, first session of each strategy

| strategy | task order | model per turn | cost per turn |
|---|---|---|---|
| no plugin: always opus | t05 h08 s01 h02 s06 s03 t02 t09 | opus opus opus opus opus opus opus opus | $0.290 $0.042 $0.037 $0.042 $0.038 $0.036 $0.020 $0.016 |
| no plugin: always sonnet | t05 h08 s01 h02 s06 s03 t02 t09 | sonnet sonnet sonnet sonnet sonnet sonnet sonnet sonnet | $0.146 $0.023 $0.020 $0.022 $0.019 $0.018 $0.015 $0.013 |
| jev-router: stickiness auto | t05 h08 s01 h02 s06 s03 t02 t09 | sonnet opus opus opus opus opus opus opus | $0.146 $0.324 $0.039 $0.051 $0.041 $0.037 $0.021 $0.016 |
| jev-router: stickiness off | t05 h08 s01 h02 s06 s03 t02 t09 | sonnet opus sonnet opus sonnet sonnet haiku haiku | $0.146 $0.340 $0.161 $0.082 $0.030 $0.025 $0.009 $0.001 |

## Per session

| strategy | session | total cost | switches | cache write | cache read |
|---|---|---|---|---|---|
| no plugin: always opus | 0 | $0.521 | 0 | 42.3k | 288.8k |
| no plugin: always opus | 1 | $0.495 | 0 | 41.5k | 281.8k |
| no plugin: always opus | 2 | $0.503 | 0 | 41.3k | 286.2k |
| no plugin: always sonnet | 0 | $0.276 | 0 | 41.4k | 286.1k |
| no plugin: always sonnet | 1 | $0.277 | 0 | 41.4k | 281.9k |
| no plugin: always sonnet | 2 | $0.267 | 0 | 40.4k | 281.1k |
| jev-router: stickiness auto | 0 | $0.675 | 1 | 78.7k | 255.8k |
| jev-router: stickiness auto | 1 | $0.610 | 1 | 77.2k | 244.8k |
| jev-router: stickiness auto | 2 | $0.596 | 1 | 79.5k | 243.0k |
| jev-router: stickiness off | 0 | $0.793 | 5 | 159.7k | 173.9k |
| jev-router: stickiness off | 1 | $0.723 | 7 | 228.6k | 92.2k |
| jev-router: stickiness off | 2 | $0.580 | 7 | 193.0k | 128.8k |
