## Intended approach
Validate in the stated order, compute `W`, then for each i: `num = total * w[i]`,
`base[i] = Math.floor(num / W)`, `rem[i] = num % W` (integer modulo, exact while
`total * w` stays under 2^53 — ~1e9 * 1e7 = 1e16 is the edge; candidates may mention BigInt).
Leftover `= total - sum(base)`; sort indexes by `rem desc, index asc` and give +1 to the
first `leftover`. Return a new array. The candidate should hand the literal agent the
algorithm, the tie-break, the error order and the exact messages, then verify with the
example table.

## Key files
- `src/shared/money.ts` (add `allocateCents`; leave `splitEvenly` alone)

## Traps
- Rounding each share with `Math.round` — sums drift (`[33,33,33]` = 99).
- "Give the remainder to the first/last element" instead of largest remainder (`[8,1,1]` for the 10/[5,1,1] case).
- Tie-break by higher index, or unstable comparison that reorders equal remainders.
- Computing remainders as floating fractions (`x - Math.floor(x)`) — ties can break the wrong way due to float error.
- Wrong validation order (e.g. checking weights before total) so the wrong message appears for inputs with several problems.
- Throwing for all-zero weights when total is 0.
- Mutating `weights` via in-place `sort`.

## Strong signals
- One complete, numbered instruction covering algorithm, tie-break, edge cases and messages.
- Uses the examples as acceptance tests and asks the agent to add them.
- Notices that zero-weight entries can't receive leftover cents and explains why (their remainder is 0 and leftover < number of non-zero remainders).
- Mentions the 2^53 limit.

## Weak signals
- Vague spec ("split proportionally, handle rounding") followed by many correction rounds.
- Accepts output without checking the sum invariant.
- Lets the agent also refactor `splitEvenly` or other code.

## Follow-up questions
- Why is largest-remainder better than rounding each share for refunds? What property does it guarantee?
- If the same order is refunded in three partial steps, how do you make the three refunds sum exactly to the full refund?
- Where does `total * weight` stop being exact in JS numbers, and what would you do about it?
- Would you ever want ties broken by largest weight instead of lowest index? Why might finance care?
