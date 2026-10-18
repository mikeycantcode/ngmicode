# Split money by weights without losing a cent

Next sprint, marketplace payouts will split a captured payment between several
sellers by weight. For example, a $100.00 order is split 1:1:1 across three sellers.
Finance has one rule: **the parts must add up to the total exactly, every time.**
They also want the split to be deterministic and "as fair as possible".

Your agent is in **literal mode**. Write the spec it implements.

## The ask

Create `src/domain/allocation.ts` exporting:

```ts
allocate(total: Money, weights: number[]): Money[]
```

## Requirements (finance-approved)

1. Return one `Money` per weight, in the same order and the same currency as `total`.
   The amounts sum to `total.amount` exactly.
2. Use the **largest remainder method**:
   - Each part starts as `floor(|total| × w_i / W)`, where `W` is the sum of the weights.
   - The leftover units (`|total|` minus the sum of floors) go one minor unit each.
     Parts with the largest fractional remainder go first.
   - On equal remainders, the **lower index** goes first.
3. A weight of `0` always gets exactly `0`.
4. Negative totals: allocate `|total|` as above, then negate every part.
   A zero part is `0`, never `-0`.
5. The result must be exact for any `total` up to `Number.MAX_SAFE_INTEGER`, with
   weights up to `Number.MAX_SAFE_INTEGER`. Intermediate products overflow doubles.
6. Invalid weights throw `RangeError("weights must be non-negative integers with a positive sum")`.
   That covers an empty array, a non-integer, a negative number, or all zeros.

Examples (USD minor units):
- `allocate(100, [1, 1, 1])` → `[34, 33, 33]`
- `allocate(5, [3, 7])` → `[2, 3]` (exact shares 1.5 and 3.5; tie goes to index 0)
- `allocate(-100, [1, 1, 1])` → `[-34, -33, -33]`

## Constraints

Use the existing `money()` constructor and helpers. Don't touch other modules.
