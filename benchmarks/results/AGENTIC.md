# Multi-step tasks with tools

6 tasks on a small fixture repo, 3 runs each, real Claude Code runs with tools. "Done" is checked by a script (tests pass, the fix works, the files exist), not by reading the answer. Cost is what Claude Code reports, subagents included.

## Whole set

| strategy | tasks done | cost | vs always opus | vs always sonnet | output tokens | turns |
|---|---|---|---|---|---|---|
| no plugin: always opus | 18/18 | $2.46 |  | +91% | 45.0k | 116 |
| no plugin: always sonnet | 18/18 | $1.29 | -48% |  | 33.2k | 128 |
| jev-router: per prompt | 18/18 | $1.27 | -48% | -2% | 34.0k | 121 |
| jev-router: every step + subagents | 18/18 | $1.15 | -53% | -11% | 33.2k | 121 |

## Per task (cost, tasks done)

| task | no plugin: always opus | no plugin: always sonnet | jev-router: per prompt | jev-router: every step + subagents |
|---|---|---|---|---|
| rename | $0.36 · 3/3 | $0.19 · 3/3 | $0.19 · 3/3 | $0.19 · 3/3 |
| bugfix | $0.22 · 3/3 | $0.14 · 3/3 | $0.14 · 3/3 | $0.13 · 3/3 |
| feature | $0.54 · 3/3 | $0.28 · 3/3 | $0.23 · 3/3 | $0.25 · 3/3 |
| subagent | $0.60 · 3/3 | $0.25 · 3/3 | $0.27 · 3/3 | $0.14 · 3/3 |
| refactor | $0.31 · 3/3 | $0.22 · 3/3 | $0.21 · 3/3 | $0.20 · 3/3 |
| hard | $0.43 · 3/3 | $0.21 · 3/3 | $0.24 · 3/3 | $0.24 · 3/3 |

## Where the money went

| strategy | spend by model |
|---|---|
| no plugin: always opus | opus-5-5 100% |
| no plugin: always sonnet | sonnet-5-5 100% |
| jev-router: per prompt | sonnet-5-5 83%, haiku-5-5 1%, opus-5-5 16% |
| jev-router: every step + subagents | sonnet-5-5 100%, haiku-5-5 0% |
