## Intended approach
Find the membership check `key in this.entries` (the `in` operator walks the prototype
chain) and replace it with an own-property check,
`Object.prototype.hasOwnProperty.call(this.entries, key)`, in **six** places:
`strictObject`, `strictObjectAsync`, `looseObject`, `looseObjectAsync`, `objectWithRest`,
`objectWithRestAsync`. Note the async rest variant uses a different code shape
(`Object.entries(input).filter(...)`) than the sync one (`for...in`), so a grep for the exact
sync line misses it. Keep `_isValidObjectKey(input, key)`, which handles the excluded
`__proto__`/`constructor`/`prototype` output keys. Plain `object()` does not iterate unknown
keys and needs no change.

With a weak agent the candidate should: grep for `in this.entries` themselves (or have the
agent do it) and hand over the full list of six files; feed one file at a time with the exact
line; then ask for tests per schema; then re-run the full suite.

## Key files
- `src/schemas/strictObject/strictObject.ts`, `strictObjectAsync.ts`
- `src/schemas/looseObject/looseObject.ts`, `looseObjectAsync.ts`
- `src/schemas/objectWithRest/objectWithRest.ts`, `objectWithRestAsync.ts`
- `src/utils/_isValidObjectKey/_isValidObjectKey.ts` (existing own-property helper for input keys)

## Traps
- **Only fixing `strictObject`** (the one in the bug report). Loose and rest variants have the
  same bug with different symptoms.
- **Forgetting the async twins.** A weak agent that fixes three sync files and stops passes a
  sync-only check. The async `objectWithRest` uses a different code shape.
- **Using `Object.hasOwn`**: fine semantically, but check the library's target. Upstream
  standardised on `Object.prototype.hasOwnProperty.call` (also used by `_isValidObjectKey`).
- **`this.entries.hasOwnProperty(key)`**: breaks when the schema declares a `hasOwnProperty`
  entry (it is then a schema object, not a function).
- **Dropping `_isValidObjectKey`** while editing, which re-opens prototype pollution through
  `__proto__` in `looseObject` output.
- **Over-correcting** by rejecting declared keys named `toString`/`constructor`.

## Strong signals
- Greps the whole `src/schemas` tree for the pattern before delegating, and enumerates all six sites.
- Explains why `in` is wrong (prototype chain) in one sentence the agent can act on.
- Checks the `__proto__` path explicitly with `JSON.parse` input (object literals with
  `__proto__:` set the prototype instead of creating a key).
- Verifies sync/async parity with the same test table.

## Weak signals
- Pastes the bug report and lets the agent pick files.
- Accepts "fixed strictObject" without asking about the other schemas.
- Writes tests with `{ __proto__: ... }` object literals, which do not create an own key, so the test proves nothing.

## Follow-up questions
- Why does `{ __proto__: 'x' }` in a literal behave differently from `JSON.parse('{"__proto__":"x"}')`? How does that affect your tests?
- Is this a security vulnerability or a correctness bug? How would you decide whether to issue an advisory?
- How would you prevent the sync and async variants from drifting again?
- `Object.hasOwn` vs `Object.prototype.hasOwnProperty.call`: what is the trade-off for a library that supports old runtimes?
- Where else might `in` against a user-influenced object be lurking (e.g. `flatten`, `intersect` merging)? How would you audit?
