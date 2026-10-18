## Intended approach
Write five `valid-frozen` fixtures (`array`, `object`, `type`, `record`, `tuple`) with
`create = true`, register them in `test/validation.test.ts`, and run them. `record` and
`tuple` fail. Root cause: `run()` in `src/utils.ts` writes every coerced child value back
into the parent (`value[k] = v`). `object`, `type` and `array` have coercers that clone the
input first (`{ ...value }` / `value.slice()`), so the write-back hits a copy. `record` and
`tuple` have no coercer, so `run()` writes into the caller's object. A frozen object throws
in strict mode; an unfrozen one is silently mutated. The upstream fix (PR #1151) adds cloning
coercers to `record` (`isNonArrayObject(value) ? { ...value } : value`) and `tuple`
(`Array.isArray(value) ? value.slice() : value`).

## Key files
- `src/utils.ts`: `run()` write-back loop (read to understand; no change needed)
- `src/structs/types.ts`: `array`, `object`, `type`, `record`, `tuple`
- `test/validation/<kind>/` + `test/validation.test.ts` (fixture registration)

## Traps
- **Fixing only `record`**. The report names `record`. `tuple` has the same gap; only the test
  matrix reveals it. Hidden tests cover all five structs.
- **Fixing in `run()` by skipping frozen objects** (`Object.isFrozen`) or try/catch around the
  write. Coerced children (defaults, trims) are then silently dropped for frozen input, and
  unfrozen input is still mutated. The second acceptance criterion rules this out.
- **Cloning arrays in `record`'s coercer**: `{ ...[1,2] }` turns an array into an object that
  then passes `record` validation. Clone only non-array objects.
- **Unregistered fixtures**: the weak agent creates fixture files but never adds them to
  `test/validation.test.ts`, so "all tests pass" means nothing. Strong candidates see the
  failing count change before the fix.
- Weak agent writes tests that call `assert()` instead of `create()`. `assert` never coerces,
  so the bug never reproduces.

## Strong signals
- Explains the root cause (write-back into an uncloned parent) before fixing.
- Shows the red run (2 of 5 failing) before the green run.
- Adds or asks about a non-mutation check for unfrozen input.
- Gives the agent one fixture as a template, then asks for the other four.

## Weak signals
- Fixes `record` only, from the issue text, with no test matrix.
- Accepts tests that pass on the unfixed code without noticing.
- Patches `run()` with `Object.isFrozen`.

## Follow-up questions
- Why did `object()` already work? What in its coercer protects it?
- Before the fix, what happened to an *unfrozen* object passed to `record().create()`? Why is that worse than the crash?
- `map()` and `set()` also have entries. Are they affected by a frozen `Map`? Why or why not?
- What is the cost of cloning on every `create()` for a large record? Could `run()` copy lazily on first write instead?
