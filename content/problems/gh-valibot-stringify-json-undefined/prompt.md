# `stringifyJson` must not clobber the input on failure

You are working in **valibot**, a schema validation library. The `stringifyJson()`
transformation action lives in `src/actions/stringifyJson/stringifyJson.ts`. Its `~run`
method calls `JSON.stringify(dataset.value, replacer, space)` and has two failure paths:

| Failure | Example input | What happens today |
|---|---|---|
| `JSON.stringify` **throws** | `123n`, a circular object | Issue added, `typed = false`, `value` **keeps the original input** |
| `JSON.stringify` **returns `undefined`** | a function, a symbol, `undefined` | Issue added, `typed = false`, `value` **becomes `undefined`** |

The second row is a bug. Anyone who inspects a failed dataset (custom error UIs, `fallback`,
logging) sees `undefined` instead of the value that failed. `parseJson` and the throw path
both keep the original input.

Your instructions to the agent are graded for precision.
Scope it tightly: this is a one-function fix.

## The ask

Change `~run` in `stringifyJson` so that:

1. When `JSON.stringify` returns a string, set `dataset.value` to that string. The dataset
   stays `typed: true`. (Unchanged.)
2. When `JSON.stringify` returns `undefined`, add the issue and set `typed = false` exactly as
   today, and leave `dataset.value` as the original input.
3. When `JSON.stringify` throws an `Error`, behave exactly as today. Re-throw anything that is
   not an `Error`, exactly as today.

## Acceptance criteria

For `stringifyJson(undefined, 'message')['~run']({ typed: true, value: input }, {})`:

- `input = () => null` returns `{ typed: false, value: input, issues: [<issue with received: 'Function'>] }`.
- `input = Symbol('test')` returns `{ typed: false, value: input, issues: [<issue with received: 'symbol'>] }`.
- `{ foo: 'bar' }` still returns `{ typed: true, value: '{"foo":"bar"}' }`.
- The issue object, its `received` text and its `message` do not change.

Update the existing test in `src/actions/stringifyJson/stringifyJson.test.ts` that asserts the
old behaviour for function input, and add a symbol case.

## Constraints

- Do not touch the action's types, overloads, issue interface or any other file.
- Do not restructure the `try`/`catch`.
