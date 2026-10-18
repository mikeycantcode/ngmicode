# Arrays pass as objects

You maintain **superstruct**, a small runtime validation library. A user filed this:

> We validate request bodies with superstruct. A client sent `[]` as the body and
> it passed validation. Our handler then crashed reading `body.settings.theme`.
>
> ```ts
> import { assert, object, record, string, number, type } from 'superstruct'
>
> assert([], object())                     // passes, should throw
> assert([], type({}))                     // passes, should throw
> assert([], record(string(), number()))   // passes, should throw
> ```

Arrays are objects in JavaScript (`typeof [] === 'object'`), but no user of these
structs means "an array" when they write `object(...)`.

## The ask

Make every struct that describes a **plain key/value shape** reject arrays.

## Acceptance criteria

- `object()`, `object({...})`, `type({...})` and `record(K, V)` all reject arrays.
- The failure looks like any other wrong-type failure for that struct: the
  failure's `type` is the struct's type (`'object'`, `'type'`, `'record'`),
  `path` is `[]`, `value` and `branch` hold the input, and `refinement` is `undefined`.
  The message stays `Expected an object, but received: …`.
- `array()`, `tuple()` and everything else keep their current behavior.
- Add a fixture under `test/validation/` for each struct you fix
  (read the README first: fixtures must be registered).
- The full visible test suite still passes.

The agent you're working with is an older, smaller model with limited context.
Keep it focused.
