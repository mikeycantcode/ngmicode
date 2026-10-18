# Add a bigint() struct

**superstruct** ships structs for every JavaScript primitive except one:

```ts
import { number, string, boolean, bigint } from 'superstruct'
//                                   ^^^^^^ does not exist
```

Users who keep 64-bit database IDs or token amounts as `BigInt` currently write
`define('bigint', v => typeof v === 'bigint')` in every project.

## The ask

Add a `bigint()` struct to the library, consistent with how the other primitive
structs are built.

## Acceptance criteria

- `bigint()` is exported from the package entry point, next to `number()` and `string()`.
- It accepts any `bigint` value (`0n`, `542n`, `-1n`).
- It rejects everything else, **including** numbers that are integers (`3`) and
  numeric strings (`'3'`). No coercion: `create(3, bigint())` throws.
- A failure looks like other primitive structs' failures: `type` is `'bigint'`,
  `refinement` is `undefined`, `path` is `[]`, `value`/`branch` hold the input.
- Its TypeScript type is `Struct<bigint, null>`.
- Add fixtures under `test/validation/bigint/` for a valid value, a string, and a
  number (see the README for how fixtures are registered).

The agent you're working with is an older, smaller model with limited context.
Keep it focused.
