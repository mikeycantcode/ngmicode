## Intended approach
Both functions build the result in a plain `{}` and **read before write**:
`groupBy` does `const items = output[key]; if (items === undefined) ... else items.push(item)`,
and `countBy` does `out[category] ??= 0; out[category] += 1`. For `"toString"` the read
finds `Object.prototype.toString`, so `groupBy` calls `.push` on a function and `countBy`
concatenates a function with a number.
Valid fixes: accumulate in a `Map` and return `Object.fromEntries(map)` (remeda #1049),
or accumulate in `Object.create(null)` and `Object.setPrototypeOf(out, Object.prototype)`
before returning (the current upstream `groupBy`). A good candidate first has the weak
agent find all read-before-write accumulators (grep for `??=` / `output[key]`), then
fixes them one file per turn, feeding the exact function body each time.

## Key files
- `src/groupBy.ts`
- `src/countBy.ts`
- `src/groupBy.test.ts`, `src/countBy.test.ts`

## Traps
- **Fixing only `groupBy`.** The report names `groupBy`; `countBy` has the same bug.
  The hidden test covers both.
- **`Object.hasOwn` guard**: works, but candidates often forget it in one of the two
  read sites, or write `key in output` (still true for `"toString"`).
- **Returning an `Object.create(null)` object without restoring the prototype**:
  `toStrictEqual` against a literal fails and `result.toString()` throws.
- **`__proto__` as a key**: assigning `out["__proto__"] = ...` on a plain object
  changes its prototype instead of adding a key. `Map` + `Object.fromEntries`
  handles it (it defines properties).
- Weak agent rewriting the whole file from a truncated read and dropping overloads
  or JSDoc.

## Strong signals
- Reproduces with a one-line test before changing anything.
- Asks the agent to search for the pattern across `src/` instead of trusting the report.
- Pastes the exact function body to the weak agent and constrains the edit to it.
- Mentions `__proto__` and prototype pollution as the related risk.

## Weak signals
- Accepts a `groupBy`-only fix.
- Lets the agent "simplify" with `reduce` + spread (quadratic, and still reads inherited keys).

## Follow-up questions
- Why does `out[key] = value` work for `"toString"` but `out[key] ??= 0` does not?
- What does `{}["__proto__"] = []` do? Is this a security issue in a server?
- `Map` + `Object.fromEntries` vs `Object.create(null)`: what are the performance and ordering trade-offs?
- Which other Remeda functions take user data as object keys, and how would you audit them?
