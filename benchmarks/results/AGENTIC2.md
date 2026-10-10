# Multi-step tasks with tools, hard fixture

4 tasks on a small fixture repo, 10 runs each, real Claude Code runs with tools. "Done" is checked by a hidden test the agent never saw (copied in after the run, and the visible tests must still pass), not by reading the answer. Cost is what Claude Code reports, subagents included.

## Whole set

| strategy | tasks done | cost | vs always opus | vs always sonnet | output tokens | turns | cost per task done |
|---|---|---|---|---|---|---|---|
| no plugin: always opus | 38/40 (83-99%) | $6.54 |  | +164% | 165.8k | 198 | $0.17 |
| no plugin: always sonnet | 38/40 (83-99%) | $2.47 | -62% |  | 94.7k | 211 | $0.07 |
| jev-router: per prompt | 19/20 (76-99%) | $2.65 | -59% | +7% | 94.9k | 131 | $0.14 |
| jev-router: every step + subagents | 18/20 (70-97%) | $2.08 | -68% | -16% | 78.3k | 118 | $0.12 |
| jev-router: !full | 20/20 (84-100%) | $1.87 | -71% | -24% | 72.6k | 127 | $0.09 |
| jev-router: ceiling sonnet | 39/40 (87-100%) | $3.02 | -54% | +22% | 119.7k | 208 | $0.08 |
| jev-router: lean (sonnet ceiling, cap medium) | 39/40 (87-100%) | $2.54 | -61% | +3% | 99.8k | 220 | $0.07 |

## Per task (cost, tasks done)

| task | no plugin: always opus | no plugin: always sonnet | jev-router: per prompt | jev-router: every step + subagents | jev-router: !full | jev-router: ceiling sonnet | jev-router: lean (sonnet ceiling, cap medium) |
|---|---|---|---|---|---|---|---|
| queue | $1.38 · 8/10 | $0.58 · 8/10 | $0.40 · 4/5 | $0.33 · 3/5 | $0.34 · 5/5 | $0.69 · 9/10 | $0.58 · 9/10 |
| intervals | $1.58 · 10/10 | $0.65 · 10/10 | $0.31 · 5/5 | $0.31 · 5/5 | $0.30 · 5/5 | $0.71 · 10/10 | $0.72 · 10/10 |
| inventory | $2.43 · 10/10 | $0.69 · 10/10 | $1.55 · 5/5 | $1.09 · 5/5 | $0.71 · 5/5 | $0.98 · 10/10 | $0.74 · 10/10 |
| flaky | $1.15 · 10/10 | $0.55 · 10/10 | $0.40 · 5/5 | $0.35 · 5/5 | $0.52 · 5/5 | $0.63 · 10/10 | $0.51 · 10/10 |

## Where the money went

| strategy | spend by model |
|---|---|
| no plugin: always opus | opus-5-5 100% |
| no plugin: always sonnet | sonnet-5-5 100% |
| jev-router: per prompt | sonnet-5-5 51%, opus-5-5 49% |
| jev-router: every step + subagents | sonnet-5-5 61%, opus-5-5 39% |
| jev-router: !full | sonnet-5-5 76%, opus-5-5 24% |
| jev-router: ceiling sonnet | sonnet-5-5 100% |
| jev-router: lean (sonnet ceiling, cap medium) | sonnet-5-5 100% |
