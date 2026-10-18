## Intended approach
Read the contract header in `src/services/idempotency.ts` and turn each bullet
into a test: replay, mismatch, per-scope isolation, in-progress, release on failure,
TTL. Add a key-order test for "the same request". Run them, and two fail:
1. **No release on failure**: the overlay removed the try/catch, so a throwing
   `fn` leaves the record `in_progress` for 24h (ticket 1). Fix: delete the
   record on error and rethrow.
2. **Order-sensitive fingerprint**: `JSON.stringify` instead of the existing
   `stableStringify` helper in `lib/objects.ts` (ticket 2). Fix: reuse the helper.
An API-level test for the realistic case is a bonus: a payment fails with
insufficient funds (422), the wallet is funded, and a retry with the same key gives 201.

## Key files
- `src/services/idempotency.ts`
- `src/lib/objects.ts` (`stableStringify`; reuse it)
- `src/api/handlers/common.ts` (`idempotent` wrapper)
- `tests/helpers.ts` (`setup`, manual clock)

## Traps
- **Writing tests that mirror the implementation** (asserting current behavior),
  which then "pass" and bake in the bugs. The weak agent tends to do this.
- **Fixing ticket 2 in the API layer** (sorting the body before calling `run`).
  Other callers stay broken. Prompt says fix in the service.
- **Hand-rolling a new sorter** instead of reusing `stableStringify`.
- **"Fixing" ticket 1 by never storing `in_progress`.** That loses the
  concurrent-duplicate protection, which is clause 4.
- Using `setTimeout` for TTL tests instead of `clock.advance`.

## Strong signals
- Pastes the contract bullets to the agent and asks for one test per bullet.
- Runs the tests *before* fixing anything and reasons from the failures.
- Recognizes that the in-progress clause needs a re-entrant call to test synchronously.
- Checks the TTL boundary.

## Weak signals
- Lets the agent generate a pile of tests without mapping them to the contract.
- Fixes bugs from reading the code without a failing test first.
- Leaves the suite with tests that pass on the buggy code only.

## Follow-up questions
- The in-progress record lives in memory. What happens if the process crashes mid-request with a real database?
- Should a 4xx validation failure release the key, and a 5xx? Why might they differ?
- How would you test the concurrent case in a multi-instance deployment?
- What should be in the fingerprint: the body only, or also path and method? What about headers?
