## Intended approach
Reproduce first: `produce({list:[1,2,3]}, d => d.list.push(...[]))` with and without
`enableArrayMethods()`. Then read `src/plugins/arrayMethods.ts`. Every mutating method
goes through `executeArrayMethod`, which calls `prepareCopy` and then `markChanged`
unconditionally. Core's `set` trap has no-op detection, but the plugin bypasses it.

The real fix (PR #1289):
- Split marking out of `executeArrayMethod` (`markArrayChanged`).
- In `handleSimpleOperation`, detect no-ops **before** `prepareCopy`: push/unshift with
  zero args, pop/shift on an empty array. Return the native value (`length` / `undefined`).
- In `handleReorderingOperation`, return early when `length <= 1`.
- In `splice`, pre-check `args.length === 0`, start normalized at/after the end, or a
  delete count that coerces below 1 with no inserts. Keep a backstop: if nothing was
  removed and nothing inserted, do not mark.
- In `src/utils/common.ts`, `getValue` must use `getFinalValue(state)` (copy only when
  modified), not `copy_ ?? base_`. An unmodified draft can still have a `copy_` (the get
  trap caches child drafts there), and Set finalization would pick it up.

## Key files
- `src/plugins/arrayMethods.ts` (`executeArrayMethod`, `handleSimpleOperation`,
  `handleReorderingOperation`, the `splice` branch)
- `src/utils/common.ts` (`getValue`, `getFinalValue`, `latest`)
- `src/core/finalize.ts`, `src/plugins/mapset.ts` (how Set children are finalized)
- `src/core/proxy.ts` (core `set` trap no-op detection, for comparison)

## Traps
- **Checking after `prepareCopy`.** Skipping `markChanged` is not enough. A stray `copy_`
  on an unmodified state still leaks through Set finalization, so arrays inside a Set
  lose identity. The maintainer's review comment on the PR was exactly this: "still doing
  some mutations of the copy due to order of operations."
- **`getValue` uses `copy_` whenever it exists.** Even a pure *read* of a nested object
  inside a Set makes the parent grow a `copy_`; the Set then returns a fresh object
  holding a revoked child draft. The hidden test catches this.
- **`splice(start)` with one argument removes everything from `start`.** It must not be
  treated as a no-op. Also `splice(1, "0")`, `splice(1, NaN)`, `splice(99, 1)`.
- Wrong native return values (e.g. returning the draft from `push()`).
- Fixing only `push` (the reported symptom) and missing `unshift`, `pop`, `shift`, `splice`,
  `sort`, `reverse`.

## Strong signals
- Reproduces with and without the plugin before reading code.
- Reasons about *why* `executeArrayMethod` marks unconditionally and where else marking happens.
- Asks the agent for the full list of mutating methods and their no-op conditions.
- Verifies identity (`toBe`) and empty patches, not just deep equality.
- Tests the Set case, or asks why the PR mentions Sets.

## Weak signals
- Accepts a fix that compares the array before/after (O(n) per call; defeats the plugin's purpose).
- Only checks `toEqual`, never reference identity.
- Lets the agent rewrite the plugin wholesale.

## Follow-up questions
- Why must the no-op check run before `prepareCopy`, not just before `markChanged`?
- Why not detect a no-op `sort()` on a long array? What would it cost?
- `getValue` used `copy_ ?? base_`. Walk me through how a pure read produced a new Set member.
- How would you guard against this whole class of regression in CI (property tests, identity assertions)?
- Which callers of Immer suffer most from lost structural sharing, and how would they notice?
