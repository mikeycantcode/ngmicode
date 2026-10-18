## Intended approach

1. **Domain.** Add `"cancelled"` to `JobState` **and to `JOB_STATES`**. Add it to the state machine
   (from waiting / delayed / blocked / active; terminal). Treat it as terminal in `isTerminal`. Add
   a `cancelled` event and a `JobCancelledError`.
2. **`Queue.cancel`.** Read the job → if terminal return false → CAS the current state to
   `cancelled` (clear lock fields; retry the read when the CAS loses a race) → clean up heap
   entries (or rely on lazy skipping) → emit → cascade to blocked dependents.
3. **Active jobs.** The worker owns the `CancelController`. It listens for `cancelled` on its queue
   and aborts the matching active job's controller. When the handler settles, `lifecycle.complete`
   / `fail` call `storage.finish(token)`. That throws `LockMismatchError` because the state is no
   longer `active`, and the result is dropped. Ideally the worker recognises a cancellation and
   doesn't log `lock:lost` noise.

## Key files

- `src/core/types.ts` (`JobState`, `JOB_STATES`), `src/core/state-machine.ts`, `src/core/errors.ts`
- `src/events/events.ts`
- `src/queue/queue.ts`
- `src/worker/worker.ts` (owns `CancelController`s), `src/worker/processor.ts` (`ctx.signal`, `ctx.sleep`)
- `src/worker/lifecycle.ts` (retry and DLQ paths that must not fire)
- `src/storage/memory-storage.ts` (per-state index built from `JOB_STATES`; lazy heap entries)
- `src/scheduler/scheduler.ts` (promotion CAS from `delayed`)

## Traps

- **`JOB_STATES` not updated.** `MemoryStorage` builds its per-state sets from `JOB_STATES`. Moving a
  job into `"cancelled"` without adding it crashes (`undefined.add`) or loses counts. Hidden test 1
  checks `counts.cancelled`.
- **Retry-backoff case.** A job between tries sits in `delayed` with a heap entry. Cancel must win
  over promotion. The scheduler's CAS from `delayed` handles this if cancel changes the state.
  Implementations that only flip a flag let the next try run. Hidden test 2.
- **Active job's late outcome.** The handler throws after cancel. With `attempts: 3` a naive
  implementation emits `failed` and schedules a retry, or dead-letters the job. A late success
  emits `completed`. Hidden test 3.
- **Not aborting the signal.** Marking state alone leaves a long handler running. Hidden test 3
  checks `onAbort` fired synchronously with cancel.
- **Cascade.** It must be transitive. Hidden test 4.
- **Using `remove()`** deletes the record, against the brief.

## Strong signals

- Builds a state × behaviour checklist from the table and turns each row into a test before
  coding.
- Asks how the queue can reach the worker that owns the job, and chooses events or a registry
  deliberately.
- Reasons about races: a job completing at the same moment it is cancelled (the CAS decides the
  winner).
- Checks that the new state flows through counts, the state machine and `isTerminal` (`admin.clean`).

## Weak signals

- Implements only waiting / delayed.
- Adds a `cancelled` boolean flag instead of a state, then patches each consumer.
- Lets the agent modify lifecycle to "check if cancelled" via a read-then-write (racy) without
  relying on lock fencing.

## Follow-up questions

- What happens if the handler ignores `ctx.signal` and keeps charging a card? How do you make
  cancellation safe for non-cooperative handlers?
- How would cancellation work across processes (Redis pub/sub, polling a cancel flag in lock
  renewal)?
- Should a cancelled job's concurrency slot be freed immediately or when the handler returns? What
  are the trade-offs?
- What should happen to a repeatable job's future occurrences when one occurrence is cancelled?
