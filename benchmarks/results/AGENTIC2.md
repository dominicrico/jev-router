# Multi-step tasks with tools, hard fixture

4 tasks on a small fixture repo, 5 runs each, real Claude Code runs with tools. "Done" is checked by a hidden test the agent never saw (copied in after the run, and the visible tests must still pass), not by reading the answer. Cost is what Claude Code reports, subagents included.

## Whole set

| strategy | tasks done | cost | vs always opus | vs always sonnet | output tokens | turns | cost per task done |
|---|---|---|---|---|---|---|---|
| no plugin: always opus | 19/20 | $3.10 |  | +159% | 85.4k | 104 | $0.16 |
| no plugin: always sonnet | 19/20 | $1.19 | -61% |  | 47.8k | 110 | $0.06 |
| jev-router: per prompt | 19/20 | $2.65 | -14% | +122% | 94.9k | 131 | $0.14 |
| jev-router: every step + subagents | 18/20 | $2.08 | -33% | +74% | 78.3k | 118 | $0.12 |
| jev-router: !full | 20/20 | $1.87 | -40% | +57% | 72.6k | 127 | $0.09 |

## Per task (cost, tasks done)

| task | no plugin: always opus | no plugin: always sonnet | jev-router: per prompt | jev-router: every step + subagents | jev-router: !full |
|---|---|---|---|---|---|
| queue | $0.66 · 4/5 | $0.24 · 4/5 | $0.40 · 4/5 | $0.33 · 3/5 | $0.34 · 5/5 |
| intervals | $0.72 · 5/5 | $0.32 · 5/5 | $0.31 · 5/5 | $0.31 · 5/5 | $0.30 · 5/5 |
| inventory | $1.19 · 5/5 | $0.33 · 5/5 | $1.55 · 5/5 | $1.09 · 5/5 | $0.71 · 5/5 |
| flaky | $0.52 · 5/5 | $0.31 · 5/5 | $0.40 · 5/5 | $0.35 · 5/5 | $0.52 · 5/5 |

## Where the money went

| strategy | spend by model |
|---|---|
| no plugin: always opus | opus-5-5 100% |
| no plugin: always sonnet | sonnet-5-5 100% |
| jev-router: per prompt | sonnet-5-5 51%, opus-5-5 49% |
| jev-router: every step + subagents | sonnet-5-5 61%, opus-5-5 39% |
| jev-router: !full | sonnet-5-5 76%, opus-5-5 24% |
