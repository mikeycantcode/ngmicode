## Intended approach
A precise instruction, e.g.: "In `src/plugins/arrayMethods.ts`, in the `filter` branch
and in the `FIND_METHODS` branch of the non-mutating handler, read `const thisArg =
args[1]` next to `const predicate = args[0]`, and replace `predicate(source[i], i, source)`
with `predicate.call(thisArg, source[i], i, source)`. Change nothing else." Then verify
with a test for each of the three methods plus the no-thisArg case.

## Key files
- `src/plugins/arrayMethods.ts` (the `filter` branch and the `FIND_METHODS` branch)

## Traps
- **Two call sites.** `filter` and `find`/`findLast` are separate branches. Naming only
  "filter" leaves `find`/`findLast` broken; the grader should penalize a spec that leaves the second unnamed, even if the agent fixes it anyway.
- **Binding the wrong `this`.** `predicate.call(state.draft_, ...)` or binding to the
  array is wrong; the spec says `thisArg`, else `undefined`.
- **Changing the arguments.** The plugin deliberately passes `source[i]` (base values)
  and `source` to the predicate to avoid proxies. An agent "fixing" this to pass drafts
  changes behavior and cost. The spec must say "arguments unchanged".
- **Falling back to native** (`source.filter(...)`): returns base values, not drafts, so
  later writes to the result would not be tracked.
- `predicate.bind(thisArg)` inside the loop: works, but allocates per iteration.

## Strong signals
- Names both branches, the exact variable, and the exact call form.
- States the "omitted thisArg → `undefined`" rule (strict-mode semantics).
- Says explicitly "do not change the arguments or the other methods".
- Asks for a test per method, including the read-only `result === base` check.

## Weak signals
- "Make filter support thisArg" with no location or call form.
- No verification of `find`/`findLast`.

## Follow-up questions
- Why does the plugin hand-roll these three methods at all?
- Why do `some`/`every`/`findIndex` already work?
- What does the predicate receive as its third argument, and is that a spec deviation?
- How would you write one test that guards every predicate method against this regression?
