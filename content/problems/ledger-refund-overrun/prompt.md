# Refunds exceed the captured amount

Finance found a payment where the merchant refunded **more than the customer paid**:

```
POST /payments                          amount 10000 USD    -> 201
POST /payments/pay_000042/capture                           -> 200
POST /payments/pay_000042/refunds       amount 6000         -> 201
POST /payments/pay_000042/refunds       amount 6000         -> 201   <-- should fail
```

The customer's wallet was credited $120.00. The merchant payable went $20 further
negative than it should have.

## The ask

Fix it so that a payment can never be refunded beyond what was captured, in total
across all refunds. That applies to refunds through the API **and** to anything
else that calls the payments service, such as the support console and batch jobs.

## Acceptance criteria

- The sum of refunds can never exceed the captured amount.
- An over-refund is rejected with `400 validation_error`. The error message
  includes the amount that is still refundable (in minor units).
- A rejected refund moves no money and leaves the payment unchanged.
- Refunding exactly the remaining amount still works, and the payment ends `refunded`.

The agent you're working with is an older, smaller model with limited context.
Keep it focused.
