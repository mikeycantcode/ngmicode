## Intended approach
The candidate restates the algorithm unambiguously for the agent: validate the
weights; take `abs` of the total; compute with BigInt `q_i = (A·w_i) / W` and
`r_i = (A·w_i) % W`; leftover = A − Σq; sort indices by `r_i` desc, then index asc;
add 1 to the first `leftover` indices; negate if the total was negative; build each
part with `money()`. They should mention that zero-weight parts have `r = 0`, so
they never get a unit (leftover < count of non-zero remainders).

## Key files
- `src/domain/allocation.ts` (new)
- `src/domain/money.ts` (`money()` constructor and its -0 normalisation)

## Traps
- **"Give the remainder to the first N parts"** is the classic shortcut. It looks
  right for `[1,1,1]` but violates the largest-remainder rule (e.g. `[0,1,1]` with
  total 3 gives a unit to the zero weight).
- **Tie-break direction**: comparing remainders as floats, or using an unstable
  sort without an index tiebreak.
- **Negative totals with Math.floor**: `floor(-100/3)` = -34 for every part, so the
  sum is wrong. Spec says allocate `abs`, then negate.
- **Overflow**: `total * w` in doubles loses precision near 2^53. BigInt is required.
- **-0** from negating zero parts.

## Strong signals
- Specifies the data types (BigInt) and the exact sort comparator.
- Walks through a worked example with the agent before or after implementation.
- Writes or asks for a property-style check: sum equals total over many random cases.

## Weak signals
- Pastes the requirements and trusts the output without checking tie-breaks or negatives.
- Accepts float arithmetic "because amounts are small".

## Follow-up questions
- Why is largest-remainder "fairer" than giving the leftover to the first parts? When is it not?
- How would you make the allocation stable if sellers are re-ordered between runs?
- What would you change if finance wanted "round half-even per part" instead? Can the sum still be exact?
- How would you test this exhaustively without hand-writing hundreds of cases?
