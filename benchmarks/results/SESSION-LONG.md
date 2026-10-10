# One long session, cache warm

8 mixed tasks (3 trivial, 3 standard, 2 hard) replayed as one multi-turn conversation per strategy, tools off, 5 sessions per strategy (0 incomplete sessions left out). Each session is one long-lived Claude Code process fed one task per turn, so each turn re-reads the cache the previous one wrote and the mod keeps its state between turns. Per-turn cost and tokens are deltas of the cumulative figures Claude Code reports. A switch is two consecutive turns carried by different models (the model with the largest cost in that turn's modelUsage).

## Per strategy (means per session)

| strategy | sessions | total cost | vs always opus | model switches | cache write tokens | cache read tokens | output tokens |
|---|---|---|---|---|---|---|---|
| no plugin: always opus | 5 | $0.476 |  | 0.0 | 35.5k | 296.0k | 6.6k |
| no plugin: always sonnet | 5 | $0.270 | -43% | 0.0 | 42.1k | 284.9k | 5.6k |
| jev-router: stickiness auto | 5 | $0.674 | +42% | 1.0 | 80.7k | 251.8k | 7.1k |
| jev-router: stickiness off | 5 | $0.678 | +42% | 6.4 | 167.7k | 159.6k | 6.6k |
| jev-router: lean (the default) | 5 | $0.475 | -0% | 0.8 | 53.0k | 279.1k | 6.3k |

## Spend by model

| strategy | spend by model |
|---|---|
| no plugin: always opus | opus 100% |
| no plugin: always sonnet | sonnet 100% |
| jev-router: stickiness auto | sonnet 26%, opus 74% |
| jev-router: stickiness off | sonnet 40%, opus 58%, haiku 2% |
| jev-router: lean (the default) | sonnet 27%, opus 73% |

## Model per turn, first session of each strategy

| strategy | task order | model per turn | cost per turn |
|---|---|---|---|
| no plugin: always opus | t05 h08 s01 h02 s06 s03 t02 t09 | opus opus opus opus opus opus opus opus | $0.290 $0.042 $0.037 $0.042 $0.038 $0.036 $0.020 $0.016 |
| no plugin: always sonnet | t05 h08 s01 h02 s06 s03 t02 t09 | sonnet sonnet sonnet sonnet sonnet sonnet sonnet sonnet | $0.146 $0.023 $0.020 $0.022 $0.019 $0.018 $0.015 $0.013 |
| jev-router: stickiness auto | t05 h08 s01 h02 s06 s03 t02 t09 | sonnet opus opus opus opus opus opus opus | $0.146 $0.324 $0.039 $0.051 $0.041 $0.037 $0.021 $0.016 |
| jev-router: stickiness off | t05 h08 s01 h02 s06 s03 t02 t09 | sonnet opus sonnet opus sonnet sonnet haiku haiku | $0.146 $0.340 $0.161 $0.082 $0.030 $0.025 $0.009 $0.001 |
| jev-router: lean (the default) | t05 h08 s01 h02 s06 s03 t02 t09 | sonnet opus opus opus opus opus opus opus | $0.007 $0.334 $0.046 $0.056 $0.053 $0.051 $0.028 $0.019 |

## Per session

| strategy | session | total cost | switches | cache write | cache read |
|---|---|---|---|---|---|
| no plugin: always opus | 0 | $0.521 | 0 | 42.3k | 288.8k |
| no plugin: always opus | 1 | $0.495 | 0 | 41.5k | 281.8k |
| no plugin: always opus | 2 | $0.503 | 0 | 41.3k | 286.2k |
| no plugin: always opus | 3 | $0.294 | 0 | 7.7k | 329.3k |
| no plugin: always opus | 4 | $0.568 | 0 | 44.7k | 293.9k |
| no plugin: always sonnet | 0 | $0.276 | 0 | 41.4k | 286.1k |
| no plugin: always sonnet | 1 | $0.277 | 0 | 41.4k | 281.9k |
| no plugin: always sonnet | 2 | $0.267 | 0 | 40.4k | 281.1k |
| no plugin: always sonnet | 3 | $0.272 | 0 | 44.3k | 288.2k |
| no plugin: always sonnet | 4 | $0.260 | 0 | 43.2k | 287.3k |
| jev-router: stickiness auto | 0 | $0.675 | 1 | 78.7k | 255.8k |
| jev-router: stickiness auto | 1 | $0.610 | 1 | 77.2k | 244.8k |
| jev-router: stickiness auto | 2 | $0.596 | 1 | 79.5k | 243.0k |
| jev-router: stickiness auto | 3 | $0.773 | 1 | 84.5k | 258.6k |
| jev-router: stickiness auto | 4 | $0.717 | 1 | 83.7k | 256.5k |
| jev-router: stickiness off | 0 | $0.793 | 5 | 159.7k | 173.9k |
| jev-router: stickiness off | 1 | $0.723 | 7 | 228.6k | 92.2k |
| jev-router: stickiness off | 2 | $0.580 | 7 | 193.0k | 128.8k |
| jev-router: stickiness off | 3 | $0.653 | 7 | 127.7k | 200.8k |
| jev-router: stickiness off | 4 | $0.642 | 6 | 129.6k | 202.2k |
| jev-router: lean (the default) | 0 | $0.595 | 1 | 45.4k | 299.3k |
| jev-router: lean (the default) | 1 | $0.445 | 1 | 43.9k | 281.4k |
| jev-router: lean (the default) | 2 | $0.446 | 1 | 44.5k | 283.0k |
| jev-router: lean (the default) | 3 | $0.263 | 0 | 43.7k | 286.2k |
| jev-router: lean (the default) | 4 | $0.627 | 1 | 87.4k | 245.6k |
