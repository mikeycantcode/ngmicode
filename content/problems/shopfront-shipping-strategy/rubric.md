## Intended approach
1. **Pin behavior first**: before touching code, write characterization tests that capture the
   current outputs for a matrix of method × region × weight × goods value, including thresholds
   (4999/5000, 9999/10000), weight rounding (1000 g vs 1001 g, 0 g → 1 kg), the overnight
   2 kg allowance, AK/HI surcharges and the error messages.
2. Build the registry (`Map` keyed by method) with built-ins registered in order. A small
   `zoned()` factory removes the US/EU duplication.
3. Replace the hard-coded `SHIPPING_METHODS` usage in the callers: `GET /cart/shipping-estimates`
   (which also relied on regex-matching the "not available" error message) → `listShippingMethods`;
   `POST /checkout` validated `shippingMethod` with `enum: SHIPPING_METHODS` → `isShippingMethod`
   against the registry; `GET /cart/quote` uses `isShippingMethod`.
With a weak agent, the candidate should feed it the original function verbatim and the
characterization tests, and have it change one caller at a time.

## Key files
- `src/shipping/rates.ts`
- `src/http/routes/cart.ts` (quote + estimates), `src/http/routes/orders.ts` (checkout validation)
- `src/domain/order.ts` (type import of `ShippingMethod`)

## Traps
- **The AK/HI quirk**: standard shipping to US-HI above the free threshold costs 1000 (free base plus the
  remote surcharge). A "cleaner" refactor that returns 0 early for free shipping changes prices.
- Express is never free, even above the threshold. Overnight is unavailable in AK/HI and the EU.
- Billable kg: `Math.max(1, ceil(g / 1000))`. 0 g still bills 1 kg.
- Error precedence: weight validation → unsupported region ("we do not ship to …") → unknown method → not available.
- Leaving `enum: SHIPPING_METHODS` in the checkout route, so registered methods are rejected at checkout (a hidden test checks this).
- Leaving the estimates endpoint on a static list, so custom methods never appear.
- Weak agent rewrites the numbers from memory (wrong per-kg rates).

## Strong signals
- Characterization tests before the refactor, run again after each step.
- Greps for every consumer of `SHIPPING_METHODS` / `ShippingMethod` and updates them deliberately.
- Notices and preserves the HI/AK surcharge-on-free quirk, and flags it to the interviewer as a probable product bug instead of silently fixing it.
- Small, verifiable steps with the weak agent.

## Weak signals
- Lets the agent rewrite `rates.ts` in one shot with no pinning tests.
- Only tests `quoteShipping` directly, never through checkout.
- Changes behavior "because it looked like a bug" without asking.

## Follow-up questions
- The registry is module-global. What problems does that cause for tests or multi-tenant stores? How would you scope it?
- How would a calculator that calls a carrier API (async, can fail) fit this interface?
- You found the HI/AK surcharge-on-free behavior. How do you raise it, and how would you change it safely?
- Should `ShippingMethod` stay a string? How would you keep type safety for built-ins?
