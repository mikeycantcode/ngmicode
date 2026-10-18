## Intended approach
Reproduce with and without the plugin. Read `handleReorderingOperation` in
`src/plugins/arrayMethods.ts`: it runs native `reverse`/`sort` on `state.copy_`, which
`prepareCopy` filled with **raw base references**. Then read the `get` trap in
`src/core/proxy.ts`: it only drafts a child when `value === peek(state.base_, prop)`,
i.e. when the value is still at its original index. After a reorder that check fails,
and the trap returns the raw base object.

The merged fix (PR #1255): when `markAllIndicesReassigned` runs, snapshot
`baseRefs_ = new Set(state.base_)`. In the get trap, also draft the value when
`isRelocatedBaseRef(state, prop, value)`: array state, `allIndicesReassigned_` set,
the index not explicitly assigned by the user, value draftable and not already a draft,
and `baseRefs_.has(value)`. The Set gives O(1) lookups (a reviewer asked for that change
over an `indexOf` scan).

Alternatives that are also acceptable: draft all elements eagerly inside
`handleReorderingOperation` before the native call (simpler, but costs proxies on the
whole array).

## Key files
- `src/plugins/arrayMethods.ts` (`handleReorderingOperation`, `markAllIndicesReassigned`)
- `src/core/proxy.ts` (`objectTraps.get`, `peek`, `ProxyArrayState`)
- `src/core/finalize.ts` (how child drafts are resolved at finalize time)

## Traps
- **Values the user assigned.** If the recipe did `d[0] = someBaseObject` after the
  reorder, that is a user assignment, and the trap must not re-draft it. Skip indices in
  `assigned_` with `true`.
- **O(n) per read.** `state.base_.includes(value)` on every get makes every read of a
  reordered array linear. The hidden tests do not catch it; the grader should.
- **Fixing only `reverse`.** `sort` goes through the same path; `splice`/`shift`/`unshift`
  also set `allIndicesReassigned_`. A fix keyed on the method name is fragile.
- **Patches.** Drafting the relocated element must also produce correct patches; checking
  only the result misses this. The sort test round-trips patches.
- Fixing it by disabling the plugin's lazy path for all arrays (big perf regression).

## Strong signals
- States the invariant ("a base object must never be returned undrafted from a draft")
  and finds where it breaks.
- Explains why vanilla Immer works: without the plugin, reverse goes through the set
  trap index-by-index and drafts.
- Asks about the cost of the fix on the hot path and keeps it O(1).
- Verifies patches and inverse patches, not just the result.

## Weak signals
- Lets the agent deep-clone the array in `handleReorderingOperation`.
- Tests only `reverse`, or only deep equality of `next`.

## Follow-up questions
- Why does the bug disappear without the plugin? Trace `reverse()` through the proxy traps.
- What if the same base object appears twice in the array? Does your fix still hold?
- Why skip indices in `assigned_`? Give a recipe that breaks if you do not.
- Eager drafting vs lazy detection: what does each cost on a 10k-element array?
- What other plugin methods put raw base refs at new indices?
