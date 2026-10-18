## Intended approach
Trace `mask()` → `validate(value, struct, { coerce: true, mask: true })` → `run()` in
`src/utils.ts`. In the starter, `run()` handles masking itself: after calling the struct's
coercer, if `mask` is set and the struct has an object schema (and is not `type`), it deletes
unknown keys. `run()` passes `mask` down when it recurses into child entries. But `union()`
does not recurse through `run()`'s entries: its **coercer** tries each member with
`S.validate(value, { coerce: true })`. That call starts a fresh validation **without** the
mask flag. The `object` member then sees `extraField`, fails as `never`, every member fails,
and the union rejects the value.

Upstream fix (PR #1251, from #1196): carry `mask` on the `Context` that `run()` passes to
coercers (`ctx = { path, branch, mask }`), forward it in `union`'s coercer
(`S.validate(value, { coerce: true, mask: ctx.mask })`), add `mask?: boolean` to
`Struct.validate`'s options, and move the key-stripping out of `run()` into `object()`'s
coercer (only when `ctx.mask && schema`). Stripping in the coercer makes "masking is an
`object` behavior" explicit and removes the special case for `type`.

A minimal fix (forward `mask` through `union`'s coercer and `Struct.validate`, keep stripping
in `run()`) is also acceptable if it passes the criteria. Judge the explanation and
verification, not just the diff shape.

## Key files
- `src/struct.ts`: `mask`, `validate`, `Struct.validate` options, `Context` type
- `src/utils.ts`: `run()` (coercion, masking block, recursion into entries)
- `src/structs/types.ts`: `object` coercer, `union` coercer, `type`
- `test/api/mask.test.ts`

## Traps
- **Making union lenient everywhere** (e.g. union's coercer always masks, or validates members
  with `type`-like semantics). That breaks the criterion that `create()` with a union of
  objects still rejects unknown keys.
- **Masking `type()` members**: putting the stripping in a shared place that also runs for
  `type` structs. The hidden test expects `{ k: '4', unknown: true }` to survive inside the union.
- **Losing defaults**: stripping after validation, or masking before the coercer runs, drops
  `defaultedProp: '42'`. The hidden tests check defaults inside masked unions and types.
- **Only fixing the top level**: `union` nested in `array` inside `object` must work, which
  requires the flag to propagate through every recursive call, not just the outermost one.
- `Struct.validate`'s options type lacks `mask`. Since the sandbox strips types, a missing
  option type compiles here but would fail `tsc` upstream. A strong candidate adds it.

## Strong signals
- States the root cause in one sentence before editing: "union re-enters validation via
  `S.validate` and drops the mask flag".
- Writes or runs a failing reproduction from the issue first.
- Checks `create()` + union + extra keys still fails after the fix.
- Notes the misleading doc comment on `Struct.validate` (`withCoercion` argument that no longer exists).
- Discusses where masking *belongs* (engine vs `object` struct).

## Weak signals
- Lets the agent change code before anyone can explain the flow.
- Fix passes the issue's example but nested/array cases are untested.
- Breaks `type()` passthrough or `create()` strictness without noticing.

## Follow-up questions
- Why does `union` validate members through `S.validate` instead of yielding entries for `run()` to recurse into? What does that cost?
- With mask on, two union members could both match after stripping. Which wins, and is that the right semantics?
- `dynamic()` and `lazy()` also delegate to another struct. Do they need the same flag forwarding? Why or why not?
- During review, a maintainer noticed `mask([0, 1, 2], object())` returned `{ '0': 0, '1': 1, '2': 2 }` before the change. What changes now, and is that a breaking change?
- What other context, besides `mask`, might a nested validation need to inherit?
