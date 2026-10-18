## Intended approach

The contract is **`attempts` = total tries, including the first** (default 1 = no retries).
Evidence:

- The README's "Conventions" section says so explicitly.
- The JSDoc on `JobOptions.attempts` in `core/types.ts` says so.
- `normalizeJobOptions` rejects `attempts < 1`. Under the "retry count" reading, `0` would be the
  natural "no retries" value, so this validation only makes sense for total tries.
- The visible timeout test (`worker.test.ts`) fails on the starter because a default job is
  retried.
- `attemptsMade` is incremented at claim time, so after the Nth try `attemptsMade === N`.

The overlay injected a coherent-looking misreading in two places, plus matching test edits:

- `worker/lifecycle.ts`: `willRetry = attemptsMade <= attempts`, with a comment claiming the
  retry-budget semantics. Fix: `<`.
- `worker/processor.ts`: `isLastAttempt = attemptsMade > attempts`. Fix: `>=`. This is the second
  code path. Fixing only the lifecycle leaves `isLastAttempt` false on the real last try, so the
  "gave up" email still never fires.
- `tests/retry.test.ts` and `tests/metrics.test.ts` were edited to encode the wrong semantics
  (`attempts: 2` → `1`, etc.). The candidate should restore them, which means `attempts` values
  that produce the asserted call counts under the correct contract.

## Key files

- `README.md` (Conventions), `src/core/types.ts`, `src/core/job.ts` (validation)
- `src/worker/lifecycle.ts`, `src/worker/processor.ts`
- `tests/retry.test.ts`, `tests/metrics.test.ts`, `tests/worker.test.ts`

## Traps

- **Trusting the code comment and the tests over the docs.** An agent that reads lifecycle.ts first
  will "explain" that the behaviour is correct.
- **Fixing only `willRetry`.** `isLastAttempt` stays wrong. Hidden test 1 checks the
  `[attempt, isLastAttempt]` sequence.
- **"Fixing" by changing the default to 0** or by subtracting 1 in normalisation. That breaks the
  documented default and validation.
- Updating the tests to match whichever behaviour the agent chose without justification.

## Strong signals

- Asks the agent to collect *all* evidence about `attempts` semantics (docs, types, validation,
  tests, code) before changing anything, and weighs it explicitly.
- Notices that the tests were changed to match the bug, and explains why "tests pass" was not
  evidence.
- Greps for every consumer of `opts.attempts` / `attemptsMade` and finds the processor.

## Weak signals

- Changes one operator and stops.
- Lets the agent rewrite tests until green without a stated contract.
- Can't explain why the customer got four charges (claim increments → 4 tries pass `<= 3`).

## Follow-up questions

- A stalled run also increments `attemptsMade`. Is that the right call for a billing job? What
  would you change?
- How would you make the billing handler itself idempotent so retries can't double-charge?
- Where else could an off-by-one like this hide (e.g. the DLQ entry's `attemptsMade`, metrics
  `retried`)?
- How would you have caught this with a property-style test?
