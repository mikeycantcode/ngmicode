## Intended approach
Reproduce. Then decompose for the weak agent: (1) where does `remove` come from? In
`src/plugins/patches.ts`, object patch generation reads `state.assigned_` and maps a
`false` entry to `REMOVE`. (2) Who writes `false` for `child`? The `set` trap in
`src/core/proxy.ts` has a fast path for "assigning the original value back over the
draft Immer made for it", which records `state.assigned_.set(prop, false)`. `false`
means *deleted* everywhere else (see `deleteProperty`). (3) Fix: in that branch,
`state.assigned_.delete(prop)`: nothing was assigned, nothing deleted. One line.

The bug is invisible unless something else on the same object changes, because patches
are only generated for modified states. That is why the repro needs `d.other = 1`.

## Key files
- `src/core/proxy.ts` (`objectTraps.set` fast path, `deleteProperty`)
- `src/plugins/patches.ts` (`generatePatchesFromAssigned`, the `REMOVE`/`REPLACE`/`ADD` choice)
- `src/core/finalize.ts` (`generatePatchesAndFinalize`: patches only for modified states)

## Traps
- **Patching the symptom in `patches.ts`** (e.g. skip `remove` when the key is still in
  `copy_`). That hides the wrong `assigned_` record from one reader but leaves it for
  others. A small model reaches for this first because the `remove` is generated there.
- **`set(prop, true)`** instead of deleting: emits a spurious `replace` patch for `child`,
  which the hidden test rejects.
- Breaking the fast path itself (removing it) so the assignment marks the state modified.
  Then a recipe that only re-assigns would no longer return the base.
- The weak agent's truncated reads may miss `deleteProperty`, so it never learns what
  `false` means. The candidate must feed that context.

## Strong signals
- Asks the agent to find every writer and reader of `assigned_` and what `true`/`false`/absent mean.
- Explains why the second assignment (`d.other = 1`) is needed to trigger the bug.
- Checks the nested case and the inverse patches.
- Keeps the change to the one line in the `set` trap.

## Weak signals
- Accepts a filter in patch generation.
- Never runs `applyPatches` to confirm the round trip.

## Follow-up questions
- Why does the bug need a second, unrelated assignment to surface?
- What are the three states of an `assigned_` entry, and who relies on each?
- Could this fast path ever see a value that is *not* the base value at that key? Why not?
- How would you property-test patch generation so this class of bug gets caught?
