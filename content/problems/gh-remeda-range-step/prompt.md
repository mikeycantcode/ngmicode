# `range()` with a step

Remeda's `range(start, end)` returns the numbers from `start` (inclusive) to `end`
(exclusive), counting by 1. Users migrating from lodash keep asking for a step:
`_.range(1, 20, 5)`. A third positional parameter does not fit Remeda's data-first /
data-last convention (`purry` picks the overload from the argument count), so the
maintainers chose an **options object** instead.

Your instructions to the agent are graded for precision. Write the spec.

## The ask

Change `range` in `src/range.ts` so that the second argument may be either a number
(today's behavior) or `{ end: number; step: number }`.

```ts
range(start: number, endOrOptions: number | { end: number; step: number }): number[]; // data-first
range(endOrOptions: number | { end: number; step: number }): (start: number) => number[]; // data-last
```

```ts
range(1, 5);                     // [1, 2, 3, 4]
range(1, { end: 20, step: 5 });  // [1, 6, 11, 16]
range(20, { end: 1, step: -5 }); // [20, 15, 10, 5]
pipe(1, range({ end: 5, step: 2 })); // [1, 3]
```

## Exact behavior

1. A plain number `end` means `step = 1`. The step is **never** inferred from the
   direction: `range(5, 1)` stays `[]`.
2. `step === 0` throws a `RangeError` with the message `range: step cannot be zero (0)!`.
3. A step that points away from `end` returns `[]`. `range(1, { end: 20, step: -5 })` is `[]`.
4. The length is `ceil((end - start) / step)`, or `0` if that is not positive.
5. Floating-point noise must not add an element. `range(0, { end: 3, step: 0.1 })` has
   exactly **30** items, although `3 / 0.1` is `30.000000000000004` in JS. Snap the
   quotient to the nearest integer when the error is **relatively** tiny (within 1e-12
   of the quotient's magnitude). A genuinely tiny range must not be snapped away:
   `range(0, 1e-13)` is `[0]`.
6. Item `i` is `start + i * step`, computed from `start` each time, not by repeatedly
   adding `step`. Item 0 is `start` itself, so `range(-0, 1)[0]` is `-0`.
7. Non-integer inputs work: `range(1, 5.5)` is `[1, 2, 3, 4, 5]`, and
   `range(1, { end: 5, step: 0.5 })` is `[1, 1.5, 2, …, 4.5]`.

## Constraints

- Keep `range` built on `purry`, and keep both overloads working in `pipe`.
- Update the JSDoc (`@signature`, `@example`) for both overloads.
- Add tests to `src/range.test.ts`. The existing suite must stay green.
