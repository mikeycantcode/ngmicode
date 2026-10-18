# Customer order cancellation

"Can I cancel my order?" is the #1 support contact. Today support cancels orders by hand in
the database, and stock counts drift every time. Product wants self-service cancellation.

## The ask

Add `POST /orders/:id/cancel` with an optional JSON body `{ "reason": string }`.

## Acceptance criteria

- A customer can cancel **their own** order while it is `pending` (not paid yet) or `paid`
  (not shipped yet). Admins can cancel any order under the same rules.
- Orders that are `shipped`, `delivered` or already `cancelled` cannot be cancelled: respond
  **409** and change nothing.
- Someone else's order behaves as if it doesn't exist (404), consistent with the rest of the orders API.
- After a successful cancel:
  - the order's status is `cancelled` and its history records the cancellation;
  - **every unit is sellable again**, with stock exactly as if the order had never been placed;
  - if the customer was charged, they get a **full refund** of what they paid;
  - an `order.cancelled` event is emitted with the reason (default `"customer_request"`).
- Respond 200 with the updated order.

## Out of scope

Partial cancellation of individual lines, and cancellation fees.
