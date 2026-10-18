# Retry backoff with seeded jitter

## Context

`computeBackoff` in `src/utils/backoff.ts` was deleted along with an old retry
module. It currently throws `not implemented`, so every retrying job crashes
the worker lifecycle. The worker calls it after try number `attempt`
(1-based) fails, and passes the job's `backoff` option plus the TaskQ's seeded
RNG (`() => number` in `[0, 1)`).

Your instructions to the agent are graded for precision. Your score depends on how precisely you specify the behaviour.

## The spec (from the retry design doc)

`computeBackoff(attempt, backoff, rng): number`

1. **Validate `attempt` first.** It must be an integer >= 1. Otherwise throw
   `RangeError("attempt must be a positive integer")`. This applies even when
   `backoff` is `undefined`.
2. `backoff === undefined` means no backoff: return `0`.
3. A plain number `n` is shorthand for `{ type: "fixed", delay: n }`.
4. Any `type` other than `"fixed"` / `"exponential"` throws
   `RangeError("unknown backoff type: <type>")`.
5. `delay` must be a finite number >= 0. Otherwise throw
   `RangeError("backoff delay must be a non-negative number")`.
6. `jitter` defaults to `0` and must be within `[0, 1]` inclusive. Otherwise
   throw `RangeError("jitter must be between 0 and 1")`.
7. The base value is `delay` for fixed, or `delay * 2^(attempt - 1)` for
   exponential.
8. If `maxDelay` is set, cap the base value at `maxDelay`. The cap applies
   **before** jitter.
9. If `jitter > 0`, multiply by `(1 - jitter * r)`, where `r = rng()`. Jitter
   only ever shortens the wait.
10. Return the result **rounded to the nearest integer** (`Math.round`).

**Determinism rule:** call `rng` exactly once when `jitter > 0`, and never in
any other case. Retry schedules are replayed from a seed in incident reviews,
so one extra call shifts every later retry.

## Acceptance criteria

- The behaviour matches every rule above, including the exact error messages.
- The visible `computeBackoff` tests and the retry tests pass.
- Only `src/utils/backoff.ts` changes.
