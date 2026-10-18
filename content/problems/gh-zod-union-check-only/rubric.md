## Intended approach
Reproduce with a scratch test. Trace `$ZodUnion` parse into `handleUnionResults` in
`src/v4/core/schemas.ts`. It returns a single option's result only when exactly one
option is "non-aborted" (`util.aborted(r)` is false). The size cap (`capSize`, added for
arrays/sets/maps) emits its `too_big` with `continue: false` before elements are parsed,
so the array option now counts as aborted. Both options abort, and the union falls back to
`invalid_union`.

The real fix (PR #6662) adds a fallback: when no option is non-aborted, keep the options
that were not hard-aborted (`!r.aborted`) and whose issues **all** came from checks.
Check issues carry a defined `continue` (true or false). Type/shape issues leave it
`undefined`. If exactly one option survives that filter, report it. Otherwise emit
`invalid_union` as before.

## Key files
- `src/v4/core/schemas.ts`: `handleUnionResults`, `$ZodUnion`, `capSize`, `$ZodArray`
- `src/v4/core/util.ts`: `aborted`, `explicitlyAborted`, `sizeCaps`
- `src/v4/core/checks.ts`: how checks set `continue` on issues

## Traps
- **Reverting the size cap** or making it non-aborting. The prompt says it stays. It
  re-opens the "one issue per element" problem.
- **Picking the first option with issues** or the "closest" option by issue count. This
  breaks the ambiguous case: two array options that both fail on size must still give
  `invalid_union` (hidden test).
- **Special-casing `too_big`** or arrays only. The number case
  (`z.int()` vs `z.number().max(5)`) must work too, and refinements are checks as well.
- Treating `continue === false` as a type mismatch. The useful signal is
  "`continue` is defined", meaning a check produced the issue.
- Ignoring `r.aborted` (a payload-level hard abort) in the fallback.

## Strong signals
- Reproduces first, then reads `util.aborted` and states the root cause precisely
  ("both options abort, so the single-match branch never fires").
- Asks the agent to list which issue codes set `continue` and why, before writing code.
- Adds tests for the three acceptance cases, including the ambiguous one.
- Runs the existing union, array, set and map tests afterwards.

## Weak signals
- Accepts an agent fix without a failing test first.
- Lets the agent "fix" it in `capSize`, or adds a flag to the array schema.
- Cannot explain why `.min()` was not affected (min is checked after parsing elements,
  with `continue: true`).

## Follow-up questions
- Why does `.min()` not regress? What would happen if min were also checked up front?
- Your fallback reports one option's check failure. Can that ever hide a better error
  from another option? Give an example.
- Does the compiled fast path (`z.compile`, `src/v4/core/compile.ts`) agree with the
  interpreter here? How would you check?
- How would you prevent this class of regression from shipping in a patch release?
