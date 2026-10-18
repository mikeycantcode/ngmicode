## Intended approach
In `volumeTierRule`: validate eagerly (empty, then per tier in input order: minQty, percent,
duplicate — a single loop with a `Set` of seen minQty, checking each tier's three conditions
before moving on), copy-and-sort tiers by `minQty` desc. In `apply`: first pass sums
quantities per `productId` over non-excluded lines; second pass for each non-excluded line
finds the tier for its product's total and calls `discountLine(state, line,
Math.floor(lineNet(line) * pct / 100), { id, label: `${label} (${pct}% off)` })`.

The skill being tested is *precise delegation*: the candidate should give
an unambiguous, ordered spec (ideally pseudo-code), name the existing helpers (`discountLine`,
`lineNet`), and explicitly forbid `percentOf` (it rounds half-up).

## Key files
- `src/pricing/tiers.ts` (the only change)
- `src/pricing/rules.ts` (`discountLine`, `lineNet`, `PRIORITY`) — reuse, don't modify
- `src/shared/money.ts` (`percentOf` rounds half-up — the trap)
- `src/pricing/engine.ts` / `promotions.ts` — show how the rule is wired

## Traps
- Reusing `percentOf` (half-up) instead of floor — off by one cent on e.g. 3825 × 7%.
- Counting per `sku` instead of per `productId`, or applying the tier only to the line that pushed the product over the threshold.
- Counting excluded lines toward the product total.
- Validating lazily in `apply` (the error then only surfaces at quote time).
- Ambiguous validation order: checking all minQty first and then all percents gives a different first error than the per-tier walk.
- Percent range: the cap is 50, not 100; percent must be an integer.
- Label format drift (`"Volume discount 10%"`).
- Sorting `tiers` in place (mutates the promotion stored in the repository).

## Strong signals
- Writes the spec as numbered steps or pseudo-code before the agent edits anything.
- Explicitly names `discountLine` and `lineNet` and says *not* to use `percentOf`.
- Asks the agent to add tests for: cross-variant aggregation, floor rounding after a category promotion, exclusion tag, each validation message.
- Re-reads the diff for unintended changes (the agent should touch one file).

## Weak signals
- "Update tiers to count per product and round down" — then fixing agent output piecemeal.
- Not noticing the existing visible test still needs to pass.
- Letting the agent change `rules.ts` or `money.ts`.

## Follow-up questions
- Why might merchandising want per-product rather than per-SKU counting? When would per-SKU be right?
- Tiers run after category promotions. What does the customer pay for 3 tees with a 10% category promo and a 10% tier — 80% or 81% of list? Why?
- How would you migrate existing `volume_tier` promotions that have `percent: 75` now that the cap is 50?
- Floor vs half-up: who wins each way at 100k orders/day, and how would finance want that documented?
