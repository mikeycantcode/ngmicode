# `uniqueWith` drops items that aren't equal to themselves

A team dedupes validation errors with Remeda. Errors that have an `id` are duplicates
when their ids match. Errors **without** an `id` must never be merged, so their
comparator returns `false` whenever either side lacks an id:

```ts
uniqueWith(errors, (a, b) =>
  a.id === undefined || b.id === undefined ? false : a.id === b.id,
);
```

Input `[{id:1}, {id:1}, {}, {}]` should give `[{id:1}, {}, {}]`.
Remeda returns `[{id:1}]`. Both id-less errors vanish.

Your instructions to the agent are graded for precision. Specify the fix exactly.

## Exact behavior

`uniqueWith(data, isEquals)` keeps the item at index `i` if and only if there is **no
earlier index `j < i`** with `isEquals(data[i], data[j]) === true`.

- An item is never compared with itself. The comparator does not have to be reflexive.
- Items are compared against **every** earlier item, kept or dropped. Example:
  `uniqueWith([1, 2, 3], (a, b) => Math.abs(a - b) === 1)` is `[1]`. `2` is dropped
  because it equals `1`, and `3` is dropped because it equals `2`.
- Output order is input order. The input array is not mutated.

## Constraints

- `uniqueWith` supports data-first (`uniqueWith(data, fn)`) and data-last inside
  `pipe` (`pipe(data, uniqueWith(fn), take(3))`). Both must follow the rule above.
  The data-last form runs through a lazy evaluator, so `take(3)` after it must still
  stop early.
- Do not change the function's signature or types. The fix lives in `src/uniqueWith.ts`.
- Add a regression test for each form to `src/uniqueWith.test.ts`.
