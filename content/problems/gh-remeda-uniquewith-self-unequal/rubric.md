## Intended approach
Both implementations find "the first index whose item equals this one" with
`data.findIndex((other) => isEquals(value, other)) === index`. With a non-reflexive
comparator, `findIndex` returns -1 for the id-less items, so they are skipped.
The fix (remeda #1001) short-circuits the item's own slot:
`data.findIndex((other, otherIndex) => index === otherIndex || isEquals(value, other)) === index`.
This also saves one comparator call per item. It must be applied to **both** the
eager `uniqueWithImplementation` and the `lazyImplementation` used by `pipe`.

## Key files
- `src/uniqueWith.ts` (eager and lazy implementations)
- `src/uniqueWith.test.ts`
- `src/internal/purryWithLazy.ts` (how `pipe` picks the lazy path)

## Traps
- **Fixing one path only.** The data-first call uses the eager implementation, the
  `pipe` form uses the lazy one. An agent told only "fix uniqueWith" usually edits
  whichever it sees first. One hidden test covers each path.
- **Comparing only against kept items** (a `result.some(...)` rewrite). Changes
  semantics: `[1, 2, 3]` with `|a - b| === 1` would give `[1, 3]` instead of `[1]`.
  Hidden tests cover this in both forms.
- **Comparing against later items too**, or using `!==` / `findLastIndex`, which
  changes which duplicate survives.
- Rewriting the lazy path to materialize the whole array, breaking early exit with `take`.

## Strong signals
- Tells the agent there are two code paths and names both.
- States the rule as "no earlier index j < i with isEquals true" and excludes j = i.
- Runs the existing lazy test (`counter.count` with `take(3)`) after the change.

## Weak signals
- "Make uniqueWith handle comparators that return false" with no rule stated.
- Only tests data-first.

## Follow-up questions
- Why does `findIndex(...) === index` fail when the comparator is not reflexive? What about `NaN` with `===`?
- This algorithm is O(n²) comparator calls. When is that unavoidable for `uniqueWith`, and how does `uniqueBy` avoid it?
- How does Remeda decide between the eager and lazy implementation?
- Should `uniqueWith` require the comparator to be an equivalence relation? What breaks if it isn't transitive?
