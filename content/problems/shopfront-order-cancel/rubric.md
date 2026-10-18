## Intended approach
1. Orient: `domain/order.ts` (`TRANSITIONS`), `checkout/order-service.ts` (`pay`, `expirePending`),
   `inventory/inventory-service.ts` (reservation lifecycle doc comment), `checkout/payments.ts`,
   `http/routes/orders.ts` (`loadVisibleOrder`).
2. Allow `paid → cancelled` in `TRANSITIONS`.
3. `OrderService.cancel(orderId, reason)`: use `transition()` so invalid states throw a ConflictError (409).
   - **pending**: `inventory.release(reservationId)`, the same as `expirePending`.
   - **paid**: the reservation is already **committed** (units left `onHand`), so `release()`
     throws "already committed". Instead `restock()` each line and `payments.refund(paymentId, totalCents)`.
   - Save, emit `order.cancelled`.
4. Route with `requireAuth`, `loadVisibleOrder` (owner or admin, 404 otherwise), `validateBody` for `reason`.

## Key files
- `src/domain/order.ts`, `src/checkout/order-service.ts`, `src/http/routes/orders.ts`
- `src/inventory/inventory-service.ts` (release vs commit vs restock)
- `src/checkout/payments.ts` (`refund`)
- README "Inventory & orders"

## Traps
- **Two stock paths**: calling `release()` for paid orders throws (committed reservation). Swallowing that error leaves `onHand` permanently short.
- Refunding `subtotalCents` instead of `totalCents` (the customer paid shipping and tax too).
- Mutating `order.status` directly instead of `transition()`, which skips the history and the 409 behavior.
- Doing side effects (refund/restock) before validating the transition: a shipped order gets refunded and then the call throws.
- Ownership: returning 403 for other customers, or forgetting admins.
- Forgetting the event, or emitting `order.cancelled` with a different shape.

## Strong signals
- Reads the inventory lifecycle comment and states the release-vs-restock distinction before coding.
- Tests both branches end to end through HTTP (stock levels before/after, gateway refunds).
- Validates the state transition before any side effects.
- Mentions the non-atomic refund + restock (what if refund fails?).

## Weak signals
- Lets the agent implement one code path and assumes it covers both.
- Never checks `onHand` after cancelling a paid order.
- Big unrelated refactors.

## Follow-up questions
- If the refund call fails after you restocked, what state are you in? How would you make this robust (outbox, retries, idempotency keys)?
- Should cancelling a paid order restock immediately, or wait for warehouse confirmation?
- How would you support cancelling a single line of a multi-line order?
- What happens to a coupon redemption when an order is cancelled? Should it be returned?
