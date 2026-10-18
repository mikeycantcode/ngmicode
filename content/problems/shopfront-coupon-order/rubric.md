## Intended approach
Read README "Pricing" and the `PricingEngine` doc comment: item-level promotions (priority 10) →
volume tiers (20) → coupon (30), each on the current net. Find that `rulesFor` sorts with
`byPriority`, newly added in `rules.ts`, which sorts **descending** ("highest priority
first"). The `PricingRule.priority` doc says "Lower runs first". So the coupon runs first, on list price:
10% of $70 = $7.00, then 20% promo = $14 → $49.00. The correct order is $14 promo, then 10% of $56 =
$5.60 → $50.40. Fix the comparator (or the call site). One-line change.

Blast radius: every cart with a **percent** coupon plus any item-level promotion/tier was
under-charged (the coupon took a percent of the larger pre-promotion amount). Coupons with a
`minSubtotalCents` were checked against the pre-promotion total, so carts that should have been
rejected (e.g. WELCOME5 on $30 of books at 40% off = $18) were accepted. Fixed-amount coupons gave the same
total unless caps kicked in. Tiers vs promotions also swapped order (rounding differences only).

## Key files
- `src/pricing/engine.ts` (`rulesFor`, class doc comment = the contract)
- `src/pricing/rules.ts` (`byPriority`, `PricingRule.priority` doc, `PRIORITY`)
- `src/pricing/coupons.ts` (min-subtotal check uses `goodsNet` at apply time)
- README "Pricing"; visible test `applies coupons to the discounted goods total` fails on the starter

## Traps
- "Fixing" the coupon to compute on the original subtotal, or changing the `PRIORITY` numbers to fit the reversed sort. That also changes `PRIORITY` semantics everywhere.
- Changing the test or docs to match the code.
- Describing the blast radius as "this one coupon" — missing the min-spend acceptance bug.
- Over-engineering (rewriting the engine into explicit stages) under a 30-minute clock.

## Strong signals
- Reproduces the ticket's exact numbers in a test before changing code.
- Traces the comparator to the "lower runs first" doc and calls out the naming ambiguity of "priority".
- Gives a crisp blast radius including the min-subtotal acceptance case and the direction (customer-favourable).
- Suggests a guard test or renaming (`order`/`sequence`) to prevent recurrence.

## Weak signals
- Accepts the agent's first theory ("coupon math is wrong") without checking the order of operations.
- Fix passes the visible test but cannot explain why $49.00.
- No blast-radius statement.

## Follow-up questions
- How would you find the affected historical orders and quantify the revenue impact?
- "Priority" is ambiguous. How would you make the API impossible to misuse?
- If marketing wanted a coupon that stacks on list price on purpose, how would you model that without breaking the contract?
- Should the engine refuse to run when two rules share a priority? Why or why not?
