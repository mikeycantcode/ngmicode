## Intended approach
Look at how `boolean()` / `number()` are built in `src/structs/types.ts` (`define(name,
validator)`), and add, in alphabetical order next to them:
```ts
export function bigint(): Struct<bigint, null> {
  return define('bigint', (value) => typeof value === 'bigint')
}
```
`src/index.ts` re-exports everything from `types.ts`, so no export change is needed. Add three
fixtures (`valid`, `invalid`, `invalid-number`) and register them in `test/validation.test.ts`.
This is exactly upstream PR #945.

## Key files
- `src/structs/types.ts`: primitive structs (`boolean`, `number`, `string`, …)
- `src/index.ts`: entry point re-exports (read only)
- `test/validation/<kind>/` + `test/validation.test.ts`

## Traps
- **Accepting integer numbers**: a weak agent "helpfully" accepts `Number.isInteger(v)` or
  `Number.isSafeInteger(v)`. The prompt says `3` must fail. Hidden test `invalid-number`.
- **Adding coercion** (`BigInt(value)`) inside the struct. That changes `create()` semantics.
  The library keeps coercion separate (`coerce(bigint(), number(), (n) => BigInt(n))`).
- **New file not exported**: putting `bigint` in a new module that `src/index.ts` does not
  re-export, or importing it in tests from the module path so the miss is hidden.
- **Wrong type name** (`'BigInt'`, `'big_int'`) breaks the failure shape.
- **Unregistered fixtures**: files under `test/validation/bigint/` that never run.
- Hand-rolling `new Struct({...})` instead of `define`: works, but ignores the codebase's idiom.

## Strong signals
- Points the agent at an existing primitive (`boolean`/`number`) as the template.
- States the reject cases explicitly (`3`, `'3'`) before the agent writes code.
- Confirms the new fixtures actually run (count goes up by 3).
- Mentions the coercion pattern for users who need `number → bigint`.

## Weak signals
- Lets the agent invent its own structure or file.
- No check that `import { bigint } from` the entry point works.

## Follow-up questions
- A user wants `create(3, X)` to return `3n`. How would they compose that from existing pieces?
- Should `min()` / `max()` accept bigint thresholds? What changes in their type signatures?
- `print()` formats received values in error messages. How does it render `542n`, and why does `JSON.stringify` matter here?
- Would `literal(5n)` work today? Why or why not?
