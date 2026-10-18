# Self-service returns

Support handles returns by hand today. It's slow, and refunds are calculated in a
spreadsheet that has been wrong by a few cents often enough that finance banned it. Build
self-service returns.

## Endpoint

`POST /orders/:id/returns` with body `{ "lines": [{ "sku": "TEE-M", "quantity": 1 }, ...] }`.
Respond **201** with `{ "refundCents": number, "order": Order }`.

## Rules

- Only the order's owner (or an admin) may return items. Anyone else gets the usual 404.
- Only **delivered** orders can be returned, and only within **30 days** of delivery
  (inclusive: exactly 30 × 24 h after delivery is still allowed). Otherwise respond **409**.
- Each request line names a sku on the order, at most once per request, with a positive
  integer quantity. A customer can never return more units of a sku than they bought,
  counting earlier returns. Invalid requests are a **400** and change nothing.
- Customers may return in several steps (one tee today, another next week).
- Returned units go back into sellable stock.
- The refund goes back to the original payment.
- Record each return on the order. When **every** unit of the order has been returned, the
  order's status becomes `returned`. Until then it stays `delivered`.
- Emit an `order.returned` event with `orderId` and `refundCents`.

## Refund amount: finance's spec (must match to the cent)

Customers get back what they actually paid for the returned units. Discounts are honored,
tax is refunded, and **shipping is never refunded**.

1. **Goods paid** `G = order.totalCents − order.shippingCents`.
2. Split `G` across the order lines in proportion to each line's net
   (`subtotalCents − discountCents`) using the **largest remainder method**: floor each share,
   then give the leftover cents one at a time to the largest remainders (ties → lower line index).
   Call line *i*'s share `P_i`. Line *i* has `q_i` units.
3. The value of the first `k` returned units of line *i* is `floor(P_i × k / q_i)`.
4. A return's refund is the sum over lines of `value(returned so far including this request) − value(returned before this request)`.

So any sequence of returns that sends back the whole order refunds exactly `G`.

## Done means

A customer can return part or all of a delivered order through the API. Stock, payments,
order state and events are all consistent afterwards.
