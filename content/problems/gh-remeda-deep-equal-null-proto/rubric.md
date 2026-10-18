## Intended approach
Replace the single `Object.getPrototypeOf(data) !== Object.getPrototypeOf(other)` check
with a small helper, e.g. `isComparablePrototype(data, other)`: same prototype → true;
`null` vs `Object.prototype` in either order → true; else false. Leave the rest of the
algorithm (Date/RegExp/Map/Set branches, key comparison with `Object.hasOwn`) alone.
Update both JSDoc blocks and add tests covering both orders, nesting, a value
mismatch, data-last, and a class instance staying unequal.

## Key files
- `src/isDeepEqual.ts`
- `src/isDeepEqual.test.ts`
- `src/purry.ts` (why an optional `strict` parameter is a problem)

## Traps
- **Dropping the prototype check altogether** ("just compare keys"): makes
  `new TestObject()` equal `{ a: 1 }` and breaks the class-vs-plain contract.
- **Only one direction**: `null` vs `Object.prototype` but not the reverse; the hidden
  test checks both argument orders.
- **Allowing `null` vs any prototype**: a null-prototype object must not equal a class
  instance.
- **Adding a `strict` flag**: the original PR first tried this; `purry` treats a third
  argument as data-first ambiguity. The prompt forbids it.
- Calling `data.hasOwnProperty(...)` on a null-prototype object throws; the existing
  code uses `Object.hasOwn`, and an agent rewriting the loop could regress it unless the spec says to keep it.

## Strong signals
- States both orders and the "exactly `Object.prototype`" condition to the agent.
- Asks the agent to keep the change local to the prototype check.
- Adds a negative test (class instance vs plain object) next to the positive ones.

## Weak signals
- Says "make null-prototype objects work" and accepts whatever comes back.
- Doesn't check the reverse argument order or the data-last form.

## Follow-up questions
- Why does `isDeepEqual` compare prototypes at all? Give a pair of objects that would be wrongly equal without it.
- Should a null-prototype object equal an object from another realm (iframe) whose prototype is a different `Object.prototype`?
- Why can't Remeda add an optional `strict` parameter to a `purry`-based function?
- What other built-ins would you want special-cased (TypedArrays, symbols as keys)?
