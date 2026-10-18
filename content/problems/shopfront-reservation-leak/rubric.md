## Intended approach
Reproduce with a test. (1) A cart whose second line is out of stock leaves the first line's
units reserved. (2) A cart with a coupon that fails pricing (e.g. WELCOME5 below its $20 minimum) leaves
every line reserved. Two bugs from the deploy:
- `InventoryService.reserve` was changed to a single pass that increments `reserved` while still
  validating, so an `OutOfStockError` on line N leaks lines 1..N-1. Fix: validate all lines first,
  then reserve all (or roll back on failure).
- `CheckoutService.checkout` lost its `try/catch` that releases the reservation when pricing/order
  creation throws. A new comment wrongly claims expiry cleans it up. That is "true" after 15 minutes,
  which explains why the symptom heals itself.
The failing visible test `is all-or-nothing` points at bug 1. Bug 2 needs reading the checkout code,
the class doc comment and the README.

## Key files
- `src/inventory/inventory-service.ts` (`reserve`)
- `src/checkout/checkout-service.ts` (`checkout`)
- `config.ts` (`RESERVATION_TTL_MS` = 15 min, which explains the self-healing)
- README "Inventory & orders"

## Traps
- Fixing only the bug the failing visible test reveals, and missing the checkout rollback.
- Trusting the misleading comment ("no rollback needed here").
- Fixing it by calling `expireStale()` or shortening the TTL.
- Releasing in a `finally` (that also releases on success, so pending orders hold no stock).
- Catching and swallowing the error instead of rethrowing (the API must still return 400/409).

## Strong signals
- Writes failing tests for both paths before fixing.
- Links the 15-minute healing to `RESERVATION_TTL_MS`.
- Checks the success path still reserves (`reserved` > 0 after a good checkout).
- Says which other code paths reserve or release stock (expirePending, pay/commit) and checks them.

## Weak signals
- Lets the agent rewrite large parts of checkout.
- Stops after the visible test turns green.
- Gives no explanation of why the issue healed itself.

## Follow-up questions
- In a real database, how would you make reserve + order creation atomic? What happens if the process crashes between the two?
- Is releasing in `catch` enough if `release` itself throws? What would you log or alert on?
- How would you detect leaked reservations in production before customers notice?
- Should coupon validation move before the reservation? What are the trade-offs?
