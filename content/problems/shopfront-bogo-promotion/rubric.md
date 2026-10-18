## Intended approach
Orient in the pricing pipeline: `pricing/engine.ts` (contract doc), `pricing/rules.ts` (`PRIORITY`,
`discountLine`, `lineNet`), `pricing/promotions.ts` (`Promotion` union, `validatePromotion`,
`ruleForPromotion`), `repo/pricing.ts` (`activeAt`), and `http/routes/admin.ts` (`POST /admin/promotions`).
Then:
1. Extend the `Promotion` union with `buy_x_get_y`.
2. Add a priority below promotions (e.g. `PRIORITY.BUY_X_GET_Y = 5`) so free units use list price.
3. Rule: pool eligible units, `free = floor(units / (buy+get)) * get`, walk lines sorted by
   `unitPriceCents` asc, then cart index (stable), and give each line `n * unitPriceCents` via `discountLine`.
4. Add validation to `validatePromotion`. That is the **second code path**: without it the admin API
   400s with "unknown promotion kind".
5. Tests: engine-level (pooling, cheapest selection, tie-break, composition with percent promo
   and coupon) and HTTP-level (create via admin, see it in `/cart/quote`).

## Key files
- `src/pricing/promotions.ts`, `src/pricing/rules.ts`, `src/pricing/engine.ts`
- `src/http/routes/admin.ts`, `src/repo/pricing.ts`
- README "Pricing"

## Traps
- **Ordering**: registering the rule at priority 10 (same as category promos). The order then depends on
  insertion order, and free units get valued at the already-discounted price.
- Computing free units per line instead of pooled across the category.
- Picking the most expensive (or the first) units instead of the cheapest, or an unstable tie-break.
- Applying the BOGO discount as an order-level discount, so it doesn't show on lines and coupons see the wrong base.
- Forgetting `validatePromotion`, so the admin endpoint rejects the new type.
- Adding a `default:` to `ruleForPromotion` that silently ignores unknown kinds.
- Float math for the discount (it's integer × integer, so no rounding is needed).

## Strong signals
- Finds the engine contract and states where BOGO fits before coding.
- Works out the composition example by hand (bogo → 10% promo → coupon) and turns it into a test.
- Exercises the admin endpoint end to end, not just the engine.
- Keeps existing promotion behavior unchanged and runs the visible pricing tests.

## Weak signals
- Lets the agent wire it in without reading the pricing contract.
- Only tests a single-line cart.
- Doesn't notice the admin validation path until the end, or at all.

## Follow-up questions
- Retailers often make the free item the cheapest *qualifying* item. When would "most expensive free" ever make sense? How would you make it configurable?
- How should a return of one of the paid tees affect the refund when the "free" tee is kept?
- Two overlapping BOGO promotions on the same category: what should happen, and how would you enforce it?
- How would you show "add 1 more tee to get one free" in the cart (upsell hint) using this rule?
