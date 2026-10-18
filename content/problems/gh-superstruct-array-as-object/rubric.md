## Intended approach
Reproduce with `assert([], object())`. Find where the `object` struct validates:
its validator in `src/structs/types.ts` uses `isObject` (`typeof x === 'object' && x != null`),
which accepts arrays. The upstream fix (PR #1252) adds an `isNonArrayObject` helper to
`src/utils.ts` and uses it in the **validators** of `object`, `record` and `type`, plus the
coercers of `object` and `type`. One shared helper keeps the three structs consistent.
Do NOT change `isObject` itself, despite its doc comment ("Check if a value is a plain
object", which is misleading). `isIterable` is built on it, and `toFailures` uses `isIterable`
to read validator results returned as arrays; `run()` also uses it to write coerced children
back into array parents.

## Key files
- `src/structs/types.ts`: `object`, `record`, `type` (validators and coercers)
- `src/utils.ts`: `isObject`, the natural home for a new helper
- `test/validation.test.ts` + `test/validation/<kind>/`: fixture registration (sandbox adapter)

## Traps
- **Fixing only `object()`**. The weak agent finds the first validator and stops. `type()` and
  `record()` have their own copies of the same check. Hidden tests cover all three.
- **Changing `isObject` globally**. Its misleading doc comment invites a one-line fix
  (`&& !Array.isArray(x)`). That fixes the reported cases but breaks 36 visible tests
  (`defaulted`, `coerce`, `union`, `mask`, `partial`, …) because `isIterable` and `run()`
  depend on it. A good candidate runs the full suite and catches this.
- **Coercer gap**. `type()`'s coercer does `{ ...value }` for any object. Under `create()` that
  turns `['a']` into `{ 0: 'a' }`, which then passes validation. Fixing only the validator leaves
  `create([..], type({}))` silently accepting arrays. `record()`'s coercer in this snapshot
  already skips arrays. Strong candidates check the coercers too.
- **Wrong failure shape**: a `refine()`-style rejection adds a `refinement` name. The prompt
  requires a plain type failure.
- Forgetting to register new fixtures in `test/validation.test.ts`, so they never run.

## Strong signals
- Gives the agent the invariant in one line ("object-like structs must reject `Array.isArray`
  values") and lists all three structs explicitly.
- Asks for one shared helper rather than three ad-hoc `Array.isArray` checks.
- Runs the whole suite after the change, not just the new fixtures.
- Checks the `create()` path as well as `assert()`.

## Weak signals
- Accepts a patch to `isObject` without running the suite.
- Only `object()` fixed or tested.
- Lets the agent re-read `types.ts` repeatedly and lose context.

## Follow-up questions
- Why not just change `isObject`? What else relies on it accepting arrays?
- Should `object()` also reject `Map`, `Date`, or class instances? What would that break for users?
- This changes validation results for existing users. Is it a patch, minor or major release? Why?
- `create([], type({}))`: walk through what happens with and without the coercer change.
