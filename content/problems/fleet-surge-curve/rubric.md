## Intended approach
Dictate the three-stage spec (validate → target → smooth) in order, and require integer arithmetic for the target. One exact form: `num = 6250·d − 7500·s`, then `extra = floor(num / (250·s)) · 250` when `num > 0`. Then clamp the previous value, apply the dead band, apply the step limit. Then update the two obsolete visible tests (`steps up by 0.25x`, and the SurgeService recompute test that expects 30 000 after one recompute with 4 requests).

## Key files
- `src/pricing/surge.ts` (`computeSurgeBps` only)
- `tests/pricing.test.ts` (update old-curve expectations)

## Traps
- **Floating point:** `7/5 − 1.2 = 0.19999999999999996`. Then `×6250` gives 1249.99…, which floors to 1000, not 1250. A literal agent writes the float formula unless told to use exact math.
- Ordering: the dead band and step limit apply AFTER the target clamp. The dead band uses strict `< 500` (500 itself moves).
- Smoothing applies to the "no surge" (demand < 5) target too, so surge decays gradually. An agent may early-return 10 000.
- A previous value above `maxBps` must be clamped first (config lowered).
- Validation: `previousBps` 9 000 or a non-integer must throw. The default parameters must stay.
- The existing visible tests now fail. The candidate must update them, not delete them, and not quietly revert the spec.

## Strong signals
- Supplies the exact-arithmetic requirement and the step order up front.
- Uses the example table as an acceptance check, and asks the agent to run the tests.
- Notices the SurgeService visible test now needs two recomputes to reach the same multiplier, and updates it consistently.

## Weak signals
- Paraphrases the spec loosely ("smooth it a bit, cap at 2500").
- Accepts a float implementation because the obvious examples pass.
- Deletes failing visible tests.

## Follow-up questions
- Why integer basis points instead of float multipliers in a pricing system?
- The dead band and step limit interact: can the curve ever get stuck short of its target? Show an example. (e.g. a target within 500 of the previous value never moves.)
- How would you roll out a curve change safely? (Shadow-compute, then compare the distributions per zone.)
- Surge locks at request time. How does smoothing change rider-facing price stability vs supply response?
