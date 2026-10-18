# Allocate cents proportionally

Refunds are blocked on ticket #318: we need to split an order-level amount (a coupon,
a refund total) across order lines **in proportion to each line's value**, without
ever losing or inventing a cent. The only splitting helper today is `splitEvenly` in
`src/shared/money.ts`, which ignores weights.

Your agent is in **literal mode**. It will implement exactly what you describe — no
more, no less. You are scored on how precisely you specify the behavior.

## The ask

Add and export `allocateCents(totalCents: number, weights: number[]): number[]` in
`src/shared/money.ts`, using the **largest remainder method**:

1. Let `W` be the sum of the weights. Each index `i` first gets
   `floor(totalCents * weights[i] / W)`.
2. The cents left over (total minus the sum of step 1) are handed out **one cent at a
   time** to the indexes with the **largest fractional remainder** (`totalCents * weights[i] mod W`).
3. Ties in remainder go to the **lower index** first.

Examples:

| totalCents | weights | result |
|---|---|---|
| 100 | `[1, 1, 1]` | `[34, 33, 33]` |
| 10 | `[5, 1, 1]` | `[7, 2, 1]` |
| 5 | `[0, 2, 0, 3]` | `[0, 2, 0, 3]` |
| 0 | `[0, 0]` | `[0, 0]` |

## Acceptance criteria

- The result has the same length as `weights` and always sums to exactly `totalCents`.
- An index with weight `0` always receives `0`.
- The input array is not mutated.
- Errors — all `RangeError`, checked in this order, with exactly these messages:
  1. `totalCents` is not a non-negative integer → `total must be a non-negative integer`
  2. `weights` is empty → `weights must not be empty`
  3. any weight is not a non-negative integer → `weights must be non-negative integers`
  4. all weights are `0` and `totalCents > 0` → `cannot allocate a positive total across zero weights`
     (all-zero weights with `totalCents === 0` returns all zeros)
- Must stay exact for realistic order sizes (totals up to ~$10M, weights up to ~$100k in cents) — no floating-point division in the remainder logic.

## Non-goals

Do not wire it into checkout or refunds yet, and do not change `splitEvenly`.
