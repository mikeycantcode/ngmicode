## Intended approach
Orient: find where Map/Set drafts live (`src/plugins/mapset.ts`, `DraftMap` and
`DraftSet` classes) and how revocation works for them: a manual `revoked_` flag set by
`revokeDraft` in `src/core/scope.ts`, checked by the existing `assertUnrevoked(state)`
helper (error 3 in `src/utils/errors.ts`). Audit every public method of both classes for
the call. The missing ones are `DraftMap.has`, `DraftMap.size`, `DraftMap.keys`,
`DraftMap.forEach` and `DraftSet.size`. Add `assertUnrevoked(state)` to each, reusing the
helper. `values`/`entries` are built on `keys`, so they throw at call time once `keys`
does.

## Key files
- `src/plugins/mapset.ts` (`DraftMap`, `DraftSet`, `assertUnrevoked`)
- `src/core/scope.ts` (`revokeDraft`, `revoke_`)
- `src/utils/errors.ts` (error 3 message)

## Traps
- **Fixing only the reported methods** (`has`, `size`). `keys` and `forEach` are also
  missing the check, and `Set.size` too. The hidden tests check all five.
- **`forEach` only "worked" by accident.** It throws via the inner `this.get(key)`,
  so an empty revoked Map iterates zero times silently. The check must be at the top.
- **Inventing a new error** or a different message. The convention is `assertUnrevoked`
  → `die(3, ...)`; the minified build relies on error numbers.
- Adding the check inside `latest()` or another shared helper used by finalization,
  which then breaks `produce` itself (finalization reads revoked state).
- Checking `revoked_` by hand with a copy-pasted throw instead of the helper.

## Strong signals
- Asks the agent to list every public method on `DraftMap`/`DraftSet` and whether it
  checks revocation, before editing.
- Reproduces in a quick test first, for both Map and Set.
- Notices that `DraftSet.has` already checks and `DraftMap.has` does not, and uses that as
  the pattern.
- Considers iterator laziness: `values()` should throw when called, not on first `next()`.

## Weak signals
- Accepts a change to a shared helper without running the visible suite.
- Only tests `has`.

## Follow-up questions
- Why do object drafts not need an explicit check? What does `Proxy.revocable` give you?
- Where is `revoked_` set, and in what order relative to finalization?
- An iterator was obtained *inside* the recipe and consumed after. What should happen?
- How would you prevent the next new method on `DraftMap` from forgetting the check?
