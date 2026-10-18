## Intended approach

The overlay changed `src/worker/lifecycle.ts` so every write uses `storage.update` (unconditional)
instead of `storage.finish(id, token, …)`. `finish` rejects the write with `LockMismatchError` when
the job is no longer `active` or the lock token has changed. A comment cites "INC-2291 lock mismatch
storms" as the justification. The worker (`worker.ts`) still has the correct
`catch (LockMismatchError) → drop + lock:lost` branch, but nothing throws it any more.

Fix: restore `storage.finish(job.id, token, …)` in **all four** writes: complete, retry-with-delay,
retry-without-delay, fail-for-good. Revert the overlay's relaxed test assertions in
`tests/scheduler.test.ts`. Ideally also address the INC-2291 concern properly (renewal cadence or
lock duration), not by dropping the fencing check.

## Key files

- `src/worker/lifecycle.ts` (overlay: unfenced writes, misleading NOTE)
- `src/storage/storage.ts` / `memory-storage.ts` (`finish` contract, `LockMismatchError`)
- `src/worker/worker.ts` (already handles `LockMismatchError`)
- `src/scheduler/scheduler.ts` (`checkStalled`, which is correct)
- `tests/scheduler.test.ts` (overlay weakened the stalled test)

## Traps

- **Fixing only `complete`.** Symptom 3 (a completed job re-run) comes from the stale worker's
  *failure* path writing `delayed` and pushing a retry. Hidden test 2 checks this.
- **Fixing it in the worker** with a pre-check (`get` → compare token → then `update`). That is
  check-then-act across an `await`, so it's still racy. The fencing must be atomic in storage
  (`finish` or a CAS).
- **"Fixing" by extending locks or disabling stall recovery.** That's out of scope and hides the
  bug.
- **Event ordering.** Emitting `completed` before the fenced write means duplicates are still
  emitted. The write must succeed before any events or `deps.onCompleted`. Hidden test 3 checks
  that dependents aren't released early.
- The weak model may trust the INC-2291 NOTE and refuse to revert.

## Strong signals

- The candidate reconstructs the timeline (claim → freeze → stall → re-claim → stale finish) and
  names the invariant: only the lock holder may write the outcome (a fencing token).
- Points the model at `Storage.finish`'s contract and the unused `token` parameter in lifecycle.
- Has the model grep every `storage.update` in `lifecycle.ts` rather than fixing the first one.
- Writes a regression test using `clock.jump` + `scheduler.tick()` to simulate the freeze.

## Weak signals

- Dedupes webhooks downstream (an idempotency key in the listener) as the only fix.
- Accepts a fix verified only by the (weakened) visible suite.
- Can't explain how symptom 3 arises.

## Follow-up questions

- What is a fencing token? Why is a lease or lock alone insufficient in distributed systems
  (cf. Kleppmann on Redlock)?
- How would you make webhook delivery itself idempotent end to end?
- If lock renewals lag under load (INC-2291), what would you change instead of removing the check?
- Could a stale worker's *side effects* (the webhook it already sent) still duplicate? How do you
  handle at-least-once delivery?
