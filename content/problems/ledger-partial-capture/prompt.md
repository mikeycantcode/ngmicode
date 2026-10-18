# Partial capture

Our biggest merchant is a grocery delivery app. It authorizes the cart total at
checkout, but often captures less because items were out of stock. Today a
capture always takes the **full** authorized amount, so the merchant voids and
re-authorizes. That puts a second hold on the customer's wallet.

## The ask

Support **partial capture**.

- Service: `capture(paymentId, { amount })`. `amount` is optional, in minor units.
- API: `POST /payments/:id/capture` takes an optional JSON body `{ "amount": <int> }`.
  No body, or no `amount`, means a full capture, exactly as today.

## Behavior

- `amount` must be a positive integer no greater than the authorized amount.
  Otherwise respond `400 validation_error`.
- A payment can be captured **once**. A partial capture ends the authorization:
  the payment becomes `captured`, and the customer gets the uncaptured remainder
  of the hold back immediately.
- The processing fee is charged on the **captured** amount.
- `capturedAmount` reflects what was captured. Refunds are limited to that amount.
- The `payment.captured` event includes `amount` (captured), `fee`, and
  `released` (the remainder returned to the customer, `0` for full captures).
- The books stay balanced, and every system account ends where it should.

## Out of scope

Multiple captures per authorization. Changing the fee policy on refunds.
