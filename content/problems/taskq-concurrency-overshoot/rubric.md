## Intended approach

The bug is in `Worker.fill()` (overlay). The loop guard is `this.active.size < this.concurrency`,
but `active` is only updated inside `process()`, *after* `await storage.claim(...)` resolves. Every
`waiting` event calls `kick()` → `fill()`. With 12 concurrent adds, 12 `fill()` calls all pass the
check before any claim resolves, so 12 jobs are claimed. This is a classic check-then-act across an
`await`.

Fix: reserve the slot synchronously before awaiting. The original code keeps an `inFlight`
counter, increments it before `claim`, and decrements it when the claim returns nothing, the claim
throws, or processing finishes. `drained` should key off the same counter.

## Key files

- `src/worker/worker.ts` (`fill`, `process`, `maybeDrained`)
- `src/queue/queue.ts` (`add` emits `waiting` → `kick`)
- `src/queue/rate-limiter.ts` (limiter acquire and release around the claim)

## Traps

- **Single-flight mutex.** Adding `if (this.filling) return` serialises fills but **drops
  wake-ups**. A job that becomes ready while a fill is mid-claim is never picked up until something
  else kicks the worker. Hidden test 3 (a dependency flow, where unblocks happen mid-fill) catches
  this, and so does the visible flow test. A correct mutex variant must set a "dirty/rerun" flag
  and loop.
- **Forgetting to release the reservation** when `claim` returns nothing or throws. Slots leak, and
  after a few empty polls the worker stops taking work.
- **Forgetting the limiter.** The limiter token taken before the claim must still be released on an
  empty claim.
- **Moving `active.set` earlier** without a placeholder entry keyed before the claim doesn't fix it.
  There is no job id before the claim.
- Weak model specifics: it may "fix" this by lowering concurrency, adding a sleep or debounce, or
  editing the test.

## Strong signals

- The candidate hands the model the exact function and states the race in one sentence ("the
  check happens before the await; the increment after").
- Asks for a regression test with `Promise.all` adds and a gated handler that records peak
  concurrency, *before* the fix, and sees it fail.
- Explicitly asks about the lost-wake-up case when choosing between a counter and a mutex.

## Weak signals

- Lets the model rewrite the worker wholesale.
- Accepts a fix verified only by the visible suite (which already passed on the bug).
- Debounce or `setTimeout` based "fixes".

## Follow-up questions

- Why does `await` make this a race in single-threaded JavaScript?
- How would you enforce a *global* concurrency limit across several worker processes?
- Your counter is decremented in `finally`. What happens if `lifecycle.complete` throws?
- How would you test for lost wake-ups systematically (e.g. exploring interleavings)?
