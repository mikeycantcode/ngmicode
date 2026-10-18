# create() crashes on frozen input

A user reported this against **superstruct** (issue #1096):

> ```ts
> import { record, string } from 'superstruct'
>
> const S = record(string(), string())
> S.create(Object.freeze({ a: 'b' }))
> ```
>
> **Expected:** `{ a: 'b' }`
> **Actual:** `TypeError: Cannot assign to read only property 'a' of object`
>
> We keep our config in frozen objects (Redux state, `as const` literals), so this
> blows up in production.

`object()` with the same input works fine. Nobody has checked the other structs.

## The ask

1. **Tests first.** Build a frozen-input test matrix: for every struct that has
   child entries, call `create()` on an `Object.freeze`d valid input and assert
   the output. Use the existing fixture format in `test/validation/<kind>/`
   (see the README for how fixtures are registered). Confirm which cases fail
   on the current code before you fix anything.
2. **Fix** every struct your matrix shows to be broken.

## Acceptance criteria

- `create()` accepts a frozen valid input for `array`, `object`, `type`,
  `record` and `tuple`, and returns an equal value.
- `create()` must not mutate the caller's input, frozen or not.
- Fixtures for each of those five structs exist and pass.
- The full visible test suite passes.

The agent you're working with is an older, smaller model with limited context and
a short tool budget. Decompose the work.
