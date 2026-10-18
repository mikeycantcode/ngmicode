# Union error regression

You are on the Zod maintainers' rotation this week. This report came in right
after the last patch release:

> **A union whose array option exceeds `.max()` now reports `invalid_union` instead of `too_big`**
>
> ```ts
> import { z } from "zod";
>
> const schema = z.union([z.array(z.string()).max(2), z.string()]);
> const result = schema.safeParse(["a", "b", "c"]);
> console.log(result.error?.issues.map(({ code, origin, path }) => ({ code, origin, path })));
> ```
>
> - **Previous patch:** `[{ code: "too_big", origin: "array", path: [] }]`
> - **Now:** `[{ code: "invalid_union", path: [] }]`
>
> `.min()` is not affected. Our form layer maps `too_big` to "too many items".
> After the upgrade, users see a generic "Invalid input". A common shape that hits this
> is "a list, or a single value", written as a union.

The last release also made arrays, sets and maps reject an oversized input
**before** parsing their elements. That change was deliberate (it stops huge inputs
from producing one issue per bad element), and it stays.

## The ask

1. Reproduce the report, and explain the root cause in a sentence or two.
2. Fix it so a union reports the specific issue again when exactly one option
   matched the input's type and was rejected only by its checks (size bounds,
   `.max()` on a number, refinements, and so on).
3. Keep the generic `invalid_union` when that is ambiguous. For example, if two
   array options both reject the input on size, the union cannot tell which one the
   caller meant.

## Acceptance criteria

- The report's snippet yields `[{ code: "too_big", origin: "array", path: [] }]`.
- `z.union([z.int(), z.number().max(5)]).safeParse(7.5)` reports `too_big`.
- `z.union([z.array(z.string()).max(2), z.array(z.number()).max(1)]).safeParse(["a", "b", "c"])`
  still reports `invalid_union`.
- Size caps still run before element parsing. Existing tests pass.

## Non-goals

Changing how size caps abort. Changing discriminated unions or `z.xor()`.
