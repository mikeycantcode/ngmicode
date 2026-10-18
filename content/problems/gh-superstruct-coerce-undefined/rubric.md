## Intended approach
Spot the line `if (v !== undefined) value[k] = v` in `run()`'s write-back loop (plain object
branch). Specify the four-row truth table to the agent as one condition:
write when `v !== undefined || k in value`. Upstream (PR #1126) made exactly that change and
added the `explicit undefined values are kept` test.

## Key files
- `src/utils.ts`: `run()`, the `isObject(value)` branch of the coerced write-back
- `test/api/create.test.ts`

## Traps
- **Reverting #1106** (always write, `value[k] = v`): fixes the issue but re-adds
  `b: undefined` / `c: undefined` for missing optional keys. Hidden test
  `missing optional fields remain missing` catches it (`toStrictEqual` distinguishes
  absent from `undefined`).
- **Checking `v === null`** or special-casing `coerce`/`optional`: wrong layer. The rule is
  about key presence, not about which struct produced `undefined`.
- **Checking the original input instead of the parent being written**: for `object()`/`type()`
  the parent is already a shallow copy (from the coercer). Either works for these tests, but a
  vague spec ("if the user passed the key") lets the agent thread the original input
  through `run()`, a much bigger change.
- **`hasOwnProperty` vs `in`**: the prompt says `in`. A candidate who specifies
  `Object.hasOwn` diverges from the spec (inherited keys). Not caught by tests; grader notes it.
- Vague instruction such as "allow undefined coercions" lets the agent touch the
  `Map`/`Set` branches or the coercers, violating constraints.

## Strong signals
- Gives the agent the exact file, function, line, and the boolean condition.
- Explicitly says "do not change anything else", and names the test to add with its expected output.
- Verifies both directions: the issue example *and* the "missing stays missing" case.

## Weak signals
- Paraphrases the issue to the agent and hopes it infers the rule.
- Accepts a change that re-breaks #1106.
- No regression test, or a test using `toEqual` (which cannot tell absent from `undefined`).

## Follow-up questions
- Why does `toStrictEqual` matter in this test, where `toEqual` would not?
- `k in value` also returns true for inherited properties. Can that bite here? When?
- For arrays, what does this rule mean for a sparse array like `[1, , 3]` coerced element-wise?
- How would you have caught this regression when #1106 was merged?
