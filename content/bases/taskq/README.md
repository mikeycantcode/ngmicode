# taskq

Background job queue & scheduler library used by our backend services (emails,
billing retries, report generation, nightly ETL). Think BullMQ / Sidekiq-lite,
with storage behind an interface and **all time injected** so everything is
deterministic under test.

```ts
import { createTaskQ } from "./src";

const tq = createTaskQ({ seed: 7 });
const emails = tq.queue("emails", { deadLetter: true, rateLimit: { max: 10, duration: 1000 } });
tq.define("emails", "welcome", async (ctx) => {
  await mailer.send(ctx.data);
  return { sent: true };
});
tq.worker("emails", { concurrency: 4 }).start();
tq.scheduler.start();

await emails.add("welcome", { to: "ada@example.com" }, { attempts: 3, backoff: { type: "exponential", delay: 1000, jitter: 0.2 } });
```

## Layout

```
src/
  api/        TaskQ composition root (createTaskQ), Admin operator tools
  core/       types, errors, job record factory + option validation, state machine, TaskqContext
  clock/      Clock interface, SystemClock, FakeClock (tests)
  storage/    Storage interface + MemoryStorage adapter (heaps for waiting/delayed, per-state indexes)
  queue/      Queue (add/addBulk/addFlow/repeat/pause), handler registry, rate limiter,
              dead-letter queue, dependency (DAG) tracker
  worker/     Worker (claim loop, concurrency), processor (JobContext, timeouts),
              lifecycle (complete / retry / fail), lock renewal
  scheduler/  Scheduler (delayed promotion, repeatables, stalled-job recovery), cron parser, repeat registry
  events/     typed emitter + the TaskqEvents catalogue
  metrics/    MetricsCollector (derived purely from events) + Histogram
  utils/      backoff, seeded RNG, heap, cancel signal, durations, logger, promise helpers
tests/        visible test-suite (uses FakeClock; `helpers.ts` has `setup()`)
```

Everything shares one `TaskqContext` (clock, storage, events, rng, registry,
dlq, deps, repeats). Components never construct their own clock/RNG/storage.

## Conventions

- **Time**: only via `ctx.clock`. No `Date.now()` / global `setTimeout` in `src/` (SystemClock excepted).
  Tests use `FakeClock.advance(ms)` (fires timers, flushes microtasks) and `jump(ms)` (frozen process).
- **Randomness**: only via the seeded `ctx.rng` (jitter). Same seed => same retry schedule.
- **Priority**: lower number runs first; default `0`; equal priorities run FIFO (by `seq`).
- **`attempts`** is the *total* number of tries including the first one (default 1 = no retries).
  `attemptsMade` counts tries *started*; it is incremented when a worker claims the job.
  `ctx.attempt` is 1-based; `ctx.isLastAttempt` is true when a failure will not be retried.
  A stalled run counts as an attempt.
- **Storage is async**. Treat every `await` as a point where another worker can interleave.
  Use `compareAndSet` for state moves that can race, and `finish(id, lockToken, …)` for anything
  a worker writes about a job it is processing: if the lock token no longer matches, the result is stale
  and must be dropped (`LockMismatchError`).
- **Events** are the integration surface (metrics, dashboards). Every lifecycle change emits one;
  see `events/events.ts`. Listener exceptions are isolated and logged.
- **Errors** extend `TaskqError` with a stable `code`. Handlers throw `UnrecoverableError` to skip retries.

## Job lifecycle

```
          add()                   claim                 handler ok
 (blocked) ──► waiting ─────────────► active ──────────────────► completed
     │            ▲   ▲                  │ │
     │ parents ok │   │ backoff = 0      │ │ handler threw, attempts left, backoff > 0
     └────────────┘   └──────────────────┘ └──────────► delayed ──(scheduler)──► waiting
                                         │
                                         └─ no attempts left / UnrecoverableError ──► failed ──► DLQ (if enabled)
```

- A job with `delay` starts in `delayed`; the scheduler promotes it to `waiting` when due.
- A job with `dependsOn` starts `blocked` until every parent is `completed`. If a parent fails
  for good, blocked descendants fail with `parent <id> failed`.
- Workers hold a lock (`lockDuration`, default 30s) renewed every `lockDuration/2`. If a worker
  freezes and the lock expires, the scheduler's stalled check moves the job back to `waiting`
  (or fails it after `maxStalledCount` stalls). The frozen worker's eventual result is discarded.

## Retries & backoff

`backoff` is either a number (fixed ms) or `{ type: "fixed" | "exponential", delay, maxDelay?, jitter? }`.
See `utils/backoff.ts` for the exact formula. Jitter uses the seeded RNG.

## Rate limiting

`rateLimit: { max, duration }` on a queue caps job *starts* to `max` in any sliding window of
`duration` ms, across **all** workers of that queue.

## Repeatable jobs

`queue.repeat(name, data, { every: ms } | { cron: "*/5 * * * *", limit? })`. Cron is 5-field UTC.
Missed occurrences (process down) are skipped, not back-filled.

## Known gaps / TODO

- `Worker.close()` does not wait for in-flight jobs (#142).
- Cron day-of-month/day-of-week use AND semantics, not Vixie OR (#57).
- No job cancellation API yet; no retention (`removeOnComplete`) yet — use `admin.clean`.
- Scheduler, DLQ replay and admin tools bypass `core/state-machine.ts` (platform#311).
