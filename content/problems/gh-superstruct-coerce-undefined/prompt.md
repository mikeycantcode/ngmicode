# Coercing a field to undefined

A user reported a regression in **superstruct** (issue #1125):

> This helper used to turn `null` from our API into a missing optional value:
>
> ```ts
> const nullAsUndefined = <T>(s: Struct<T>) =>
>   coerce(optional(s), literal(null), () => undefined)
>
> const User = type({ name: string(), nickname: nullAsUndefined(string()) })
> User.create({ name: 'Ann', nickname: null })
> // expected { name: 'Ann', nickname: undefined }
> // actual   { name: 'Ann', nickname: null }   <- null leaks through
> ```
>
> I think this broke in #1106.

PR #1106 stopped `create()` from **adding** `undefined` keys for optional fields
that were missing from the input (`create({ a: 'a' })` must return `{ a: 'a' }`,
not `{ a: 'a', b: undefined }`). It did so by never writing an `undefined`
coerced value back into the parent object. That also throws away coercions
that deliberately produce `undefined`.

## Where

The write-back happens in `run()` in `src/utils.ts`: after a child entry is
validated with coercion on, its coerced value is stored into the parent
(`Map`, `Set`, or plain object/array). Only the plain object/array branch is in
scope.

## The ask

Your instructions to the agent are graded for precision. Specify the
rule precisely enough that it changes only what's needed. You have the
behavior below to pin down.

## Required behavior (for an object or array parent, key `k`, coerced child value `v`)

| Input has key `k`? | `v`              | Result in output                  |
|--------------------|------------------|-----------------------------------|
| yes                | not `undefined`  | `k` set to `v`                    |
| yes                | `undefined`      | `k` present with value `undefined` |
| no                 | not `undefined`  | `k` set to `v` (e.g. `defaulted`) |
| no                 | `undefined`      | `k` stays absent                  |

"Input has key `k`" means `k in parent` on the parent value being coerced
(which, for `object()`/`type()`, is already a shallow copy of the input).

## Constraints

- One-line scale change in `run()`. Do not touch the `Map`/`Set` branches,
  the struct definitions, or the coercers.
- `create(undefined, defaulted(...))` and every existing test keep passing.
- Add a regression test for the issue's example to the `create` API tests.
