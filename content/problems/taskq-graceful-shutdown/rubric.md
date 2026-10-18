## Intended approach

This is a multi-module change. The components are:

- **TaskQ.close(opts)** (`api/taskq.ts`): memoise the shutdown promise → `scheduler.stop()` → mark
  every queue closed → `Promise.all(workers.map(w => w.close(opts)))` → emit `closed`.
- **Queue** (`queue/queue.ts`): a `closed` flag. `add` (and `repeat`) throw `QueueClosedError`,
  which already exists in `core/errors.ts`, unused. That is a reuse signal.
- **Worker.close(opts)** (`worker/worker.ts`): set `running = false`, unsubscribe, clear the
  rate-limit wake timer, then wait for `inFlight === 0` **or** a clock timer of `timeoutMs`,
  whichever comes first. On timeout, for each active job: abort its `CancelController`, then hand
  the job back with `storage.finish(id, lockToken, { state: "waiting", attemptsMade: n - 1 })` +
  `pushWaiting`. That is fenced by the lock, so a job that finishes at the same instant isn't
  clobbered. The handler's late result then hits `LockMismatchError` in lifecycle and is dropped.
- **In-flight claims.** A `fill()` that was awaiting `claim()` when close began must give the job
  back rather than start it.
- The `events.ts` catalogue gains `closed`.

## Key files

- `src/api/taskq.ts`, `src/worker/worker.ts` (TODO #142), `src/queue/queue.ts`
- `src/core/errors.ts` (`QueueClosedError`), `src/scheduler/scheduler.ts` (`stop()`)
- `src/worker/lifecycle.ts`, `src/storage/storage.ts` (`finish` fencing),
  `src/worker/processor.ts` (signal)
- `src/clock/fake-clock.ts` (deadline must use the injected clock)

## Traps

- **Real-time deadline.** Using global `setTimeout` or `Date.now()` instead of `ctx.clock` makes the
  FakeClock tests hang or pass vacuously. Hidden test 2 advances the fake clock to exactly
  `timeoutMs`.
- **Burning the attempt.** Putting the job back with `update({state: "waiting"})` leaves
  `attemptsMade = 1`, which is the exact production complaint. Hidden test 2.
- **Late result not ignored.** An unfenced `update` lets the late handler resolution mark the job
  `completed` after it was handed back. Hidden test 2 resolves the handler afterwards.
- **Rejecting new adds with a generic Error** instead of `QueueClosedError`. Hidden test 1.
- **Not stopping the scheduler.** Delayed jobs get promoted after close. Hidden test 3.
- **Non-idempotent close.** Double `closed` events, or two deadline timers releasing jobs twice.
  Hidden test 3.
- **Polling `activeCount`** with real timers to detect idle.
- **Worker-only change** that never touches TaskQ, Queue or Scheduler. That's typical when the agent
  is pointed at TODO #142 alone.

## Strong signals

- Starts by mapping every component that does work in the background (scheduler timer, worker
  wake timer, lock renewals, event subscriptions) and what "stopped" means for each.
- Specifies the deadline semantics precisely to the agent (inclusive at `timeoutMs`, injected
  clock).
- Recognises lock fencing as the mechanism that makes "ignore late results" safe.
- Writes FakeClock tests for both the drain path and the deadline path before trusting the agent.

## Weak signals

- `await Promise.all(activeJobs)` with no deadline.
- Marks stragglers `failed` or leaves them `active` for the stall checker.
- Lets new jobs keep being accepted during shutdown.

## Follow-up questions

- The platform kills the pod at 30 s. Why should `timeoutMs` be lower, and by how much?
- A handler ignores the abort signal and keeps writing to the DB after the job was handed back.
  What can go wrong, and how do you design handlers for that?
- How would you do this across multiple processes sharing Redis (drain mode, readiness probes)?
- Should a job aborted by shutdown keep its priority and FIFO position? Does it today?
