# Flaky tasks: retries and `--continue`

Two requests from teams with large test suites:

1. **Retries.** Some integration tests are flaky. Teams want a task to be retried
   automatically before the run fails.
2. **Keep going.** On a failure, CI wants every task that *can* still run to run, so one red
   package doesn't hide failures in unrelated ones.

## Scheduler API

`runSchedule` gets the core behavior:

```ts
interface ScheduledTask { id; deps; run; retries?: number; retryDelayMs?: number }  // defaults 0 and 100
interface ScheduleOptions { concurrency; clock?; bus?; continueOnError?: boolean }    // default false
interface TaskOutcome { /* existing fields */ attempts: number }                     // 0 if never started
```

**Retries**
- A task gets up to `1 + retries` attempts. After failed attempt *k* (1-based), wait
  `retryDelayMs × 2^(k-1)` on the injected clock, then the task becomes ready again.
- **A task waiting out its backoff does not hold a concurrency slot.** Other ready tasks may use it.
  When the backoff ends, the retry waits for a free slot like any other ready task.
- `startedAt` is the start of the first attempt. `finishedAt` is the end of the last attempt.
- A failure that will be retried is not a failure yet. It doesn't trigger fail-fast.

**continueOnError**
- `false` (default): unchanged fail-fast behavior.
- `true`: after a final failure, tasks that don't depend on a failed task (directly or
  transitively) keep starting. Tasks that do are `skipped`. `ok` is `false`.

In every mode, `runSchedule` resolves only after no attempt is running and no backoff is
pending, and `maxConcurrency` never exceeds `concurrency`. A backoff that ends after
fail-fast has stopped the run doesn't retry. That task reports `failed`.

## Runner / config / CLI

- Pipeline tasks accept `"retries"` and `"retryDelayMs"` in `buildgraph.json` (and in per-package
  overrides). They're passed through to the scheduler and don't affect the task hash.
- `runTasks` accepts `continueOnError`. Each task result reports `attempts`.
- `build` / `test` accept `--continue`.

## Acceptance
Deterministic under `ManualClock`. Existing behavior and tests unchanged.
