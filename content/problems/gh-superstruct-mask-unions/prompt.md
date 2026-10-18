# mask() breaks inside union()

**superstruct** has three ways to run a struct over a value:
`assert`/`is` (validate only), `create` (coerce, then validate) and `mask`
(coerce, validate, and drop properties that an `object()` schema does not know).
`mask` is meant for parsing untrusted payloads that carry extra fields.

A long-standing issue (#803):

> ```ts
> const ItemA = object({ type: literal('a'), valueA: string() })
> const ItemB = object({ type: literal('b'), valueB: string() })
>
> mask({ type: 'a', valueA: 'test', extraField: true }, ItemA)
> // ✓ { type: 'a', valueA: 'test' }
>
> mask({ type: 'a', valueA: 'test', extraField: true }, union([ItemA, ItemB]))
> // ✗ StructError: Expected the value to satisfy a union of `object | object`
> ```
>
> I don't want to maintain a second copy of my whole schema tree with `type()`
> just to get lenient parsing.

## The ask

This is a code-comprehension round. Before changing anything, walk your
interviewer through how `mask()` currently works end to end: where the "drop
unknown keys" step happens, and why a union member never gets it. Then fix it.

## Acceptance criteria

- `mask()` drops unknown keys from `object()` structs at any depth, including
  when the object is a member of a `union()` (also inside arrays).
- Defaults (`defaulted`) inside masked objects and union members are still applied.
- `type()` keeps its contract: it never drops unknown keys, masked or not.
- `assert`, `is`, `validate` and `create` behave exactly as before. In particular,
  `union([object(...)])` used with `create()` must still reject unknown keys.
- The full visible test suite passes.

## Non-goals

- Changing which union member wins when several match (first match still wins).
