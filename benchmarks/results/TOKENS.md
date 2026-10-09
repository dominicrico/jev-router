# Token usage and cost

30 tasks measured. Each task ran once per strategy, headless, with no tools, in an empty directory. Output tokens include thinking tokens. Cost is the dollar figure Claude Code reports.

## Whole task set

| strategy | output tokens | input tokens | cost | cost vs always opus | output vs always opus | cost vs always sonnet |
|---|---|---|---|---|---|---|
| no plugin: always opus | 50.0k | 83.3k | $1.16 |  |  |  |
| no plugin: always sonnet | 35.0k | 83.4k | $0.44 | -62% | -30% |  |
| jev-router efficient | 134.0k | 91.1k | $2.59 | +123% | +168% | +491% |
| jev-router balanced | 125.5k | 91.2k | $2.34 | +101% | +151% | +434% |
| jev-router cheap | 53.5k | 91.2k | $0.54 | -53% | +7% | +25% |

## Trivial tasks

| strategy | output tokens | cost | cost vs always opus |
|---|---|---|---|
| no plugin: always opus | 3.3k | $0.13 |  |
| no plugin: always sonnet | 3.0k | $0.063 | -50% |
| jev-router efficient | 3.4k | $0.004 | -97% |
| jev-router balanced | 3.4k | $0.004 | -97% |
| jev-router cheap | 3.4k | $0.004 | -97% |

## Standard tasks

| strategy | output tokens | cost | cost vs always opus |
|---|---|---|---|
| no plugin: always opus | 13.1k | $0.31 |  |
| no plugin: always sonnet | 8.9k | $0.12 | -63% |
| jev-router efficient | 9.4k | $0.11 | -65% |
| jev-router balanced | 9.5k | $0.11 | -65% |
| jev-router cheap | 8.7k | $0.099 | -68% |

## Hard tasks

| strategy | output tokens | cost | cost vs always opus |
|---|---|---|---|
| no plugin: always opus | 33.7k | $0.72 |  |
| no plugin: always sonnet | 23.1k | $0.26 | -64% |
| jev-router efficient | 121.2k | $2.48 | +242% |
| jev-router balanced | 112.6k | $2.22 | +207% |
| jev-router cheap | 41.4k | $0.44 | -39% |

## Effort held equal

Jev also picks the reasoning effort, and effort drives token use far more than the model does. Here each router mode is compared with **opus at the same effort Jev chose**, so the only difference is the model.

| mode | tier | router output | opus same effort output | router cost | opus same effort cost | cost saved |
|---|---|---|---|---|---|---|
| efficient | trivial | 3.4k | 2.4k | $0.004 | $0.096 | -96% |
| efficient | standard | 9.4k | 12.5k | $0.11 | $0.27 | -60% |
| efficient | hard | 121.2k | 121.2k | $2.48 | $2.48 | -0% |
| balanced | trivial | 3.4k | 2.4k | $0.004 | $0.096 | -96% |
| balanced | standard | 9.5k | 12.2k | $0.11 | $0.27 | -59% |
| balanced | hard | 112.6k | 118.6k | $2.22 | $2.42 | -8% |
| cheap | trivial | 3.4k | 2.4k | $0.004 | $0.096 | -96% |
| cheap | standard | 8.7k | 11.1k | $0.099 | $0.24 | -59% |
| cheap | hard | 41.4k | 117.8k | $0.44 | $2.41 | -82% |

## Effort alone

The same model (opus) at its default effort against opus at the effort Jev chose, hard tasks only. Shows what the effort setting costs, apart from any routing.

| opus effort | output tokens | cost |
|---|---|---|
| default (no plugin) | 33.7k | $0.72 |
| as Jev picks in efficient | 121.2k | $2.48 |
| as Jev picks in balanced | 118.6k | $2.42 |
| as Jev picks in cheap | 117.8k | $2.41 |
