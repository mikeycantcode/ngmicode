# Volume tiers v2

Merchandising wants "buy more, save more" to behave like it does at our competitors.
The rule lives in `src/pricing/tiers.ts` (`volumeTierRule`) and is plugged into the
pricing engine through `volume_tier` promotions. Today it looks at each cart line on its
own and rounds half-up.

Your agent is in **literal mode**: it does exactly what you say and never fills gaps. A
wrong word in your instructions becomes a wrong line of code. Constrain it so it cannot go
wrong.

## New behavior (v2)

Keep the signature `volumeTierRule(id, tiers, label = "Volume discount")` and everything
the engine relies on (`stage: "item"`, priority `PRIORITY.VOLUME_TIER`).

1. **Quantity is counted per product, not per line.** Sum the quantities of all lines that
   share a `productId` (e.g. 2 × Tee S + 2 × Tee M = 4 tees). The tier chosen by that
   total applies to **every** line of that product.
2. The tier used is the one with the **highest `minQty` that is ≤ the product's total
   quantity**. Tiers may be given in any order.
3. **Exclusions:** a line whose `tags` contain `"no-volume-discount"` is neither counted nor
   discounted.
4. **Amount:** each discounted line gets `floor(lineNet × percent / 100)` cents off, where
   `lineNet` is the line's net *at the moment the rule runs* (after earlier promotions).
   Round **down** — never in the customer's favour by a fraction of a cent.
5. Apply the discount with the existing `discountLine` helper so caps and adjustments keep
   working. The adjustment label must be `` `${label} (${percent}% off)` ``.
6. **Validation** happens when `volumeTierRule` is called (not when it is applied). Throw a
   `RangeError` with exactly these messages; check the conditions in this order and report the
   first failure, walking tiers in the order given:
   - `tiers` is empty → `volume tiers must not be empty`
   - for each tier: `minQty` is not an integer ≥ 2 → `invalid tier minQty: <minQty>`
   - for each tier: `percent` is not an integer from 1 to 50 inclusive → `invalid tier percent: <percent>`
   - for each tier: its `minQty` appeared in an earlier tier → `duplicate tier minQty: <minQty>`
7. Do not mutate the `tiers` array you are given.

## Constraints

Only `src/pricing/tiers.ts` should change. Existing tests must keep passing.
