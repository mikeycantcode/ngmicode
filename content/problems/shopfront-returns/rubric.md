## Intended approach
This touches every layer. Map them first: `domain/order.ts` (statuses, `TRANSITIONS`, history holds the
delivery timestamp), `checkout/order-service.ts` (where order operations live), `checkout/payments.ts`
(`refund`), `inventory/inventory-service.ts` (`restock`, because return units come back to `onHand`,
not via reservations), `shared/events.ts` (add `order.returned` to the union), `config.ts`
(`RETURN_WINDOW_DAYS` already exists, unused), `shared/money.ts` (no allocation helper exists;
README "Known debt" #318), `http/routes/orders.ts` (`loadVisibleOrder` for ownership), and
`http/routes/admin.ts` (the status filter list should learn `returned`).

Implement `OrderService.returnItems()`: validate state and window, then lines (all-or-nothing), compute the
refund **cumulatively** (value after minus value before) from an allocation of `total − shipping`,
refund via the gateway, restock, record the return, transition to `returned` when everything is back,
and emit the event. Add the route.

## Key files
- `src/checkout/order-service.ts`, `src/domain/order.ts`, `src/http/routes/orders.ts`
- `src/shared/money.ts` (add `allocateCents`), `src/shared/events.ts`, `src/config.ts`
- `src/checkout/payments.ts`, `src/inventory/inventory-service.ts`

## Traps
- **Cent drift**: computing each partial refund independently (`round(P_i × n / q_i)`), so three
  one-unit returns don't sum to `P_i`. The cumulative formula avoids it (hidden test checks the sum).
- Refunding list price (`unitPriceCents × qty`), ignoring item discounts and coupon, or forgetting tax.
- Refunding shipping.
- Rounding instead of the specified largest-remainder allocation (off by a cent on some lines).
- Window boundary: `>=` vs `>` (exactly 30 days must be allowed), and measuring from `createdAt` instead of delivery.
- Using `inventory.release()` (that's for reservations) instead of `restock()`.
- Partial application on invalid input (refund issued, then a later line fails validation).
- Forgetting the `order.returned` event type in the union, or the `delivered → returned` transition.
- Over-return check ignoring earlier returns.

## Strong signals
- Builds a worked example by hand (or in a test) before writing the refund code, including a 3-step partial return.
- Asks the agent for the allocation helper as a separate, tested unit.
- Uses the existing helpers (`transition`, `loadVisibleOrder`, `restock`, `refund`) instead of re-inventing them.
- Checks the end-to-end invariant: Σ refunds = total − shipping.
- Mentions idempotency and failure ordering (refund vs restock).

## Weak signals
- Lets the agent produce one large diff, then debugs cents by trial and error.
- Tests only a single full return.
- Ignores the event or status requirements.

## Follow-up questions
- The gateway refund succeeded but saving the order failed. What now? How would you make returns idempotent (e.g. a client-supplied return id)?
- Should returned units always be restocked? (damaged goods, inspection step)
- How would a BOGO promotion change what "paid for those units" means?
- Finance later wants shipping refunded when *everything* is returned within 7 days. Where does that rule go?
- How would you report refunds to the tax system per region?
