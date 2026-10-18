# Extract the payment state machine

Payment status rules are scattered through the payments service as ad-hoc `if`
checks, with some inconsistencies (`!=`, a duplicated check). Next quarter we're
adding disputes and chargebacks, which add statuses and transitions. Before that,
we want **one place** that defines which status changes are legal.

## The ask

1. Create `src/domain/paymentStateMachine.ts` that exports:

   ```ts
   type PaymentEvent = "capture" | "void" | "expire" | "refund" | "refund_full";
   transition(status: PaymentStatus, event: PaymentEvent): PaymentStatus
   allowedEvents(status: PaymentStatus): PaymentEvent[]
   ```

   - `transition` returns the next status. On an illegal transition it throws
     `InvalidTransitionError` with message `cannot <verb> payment in status <status>`.
     `<verb>` is the event name, except that `refund_full` uses `refund`.
   - `allowedEvents` returns the legal events in the order the type lists them.
   - Legal transitions:

     | from | event → to |
     | --- | --- |
     | authorized | capture → captured, void → voided, expire → expired |
     | captured, partially_refunded | refund → partially_refunded, refund_full → refunded |
     | refunded, voided, expired | none |

2. Refactor the payments service so that **every** status change goes through
   `transition`. Remove the old ad-hoc checks.

## Acceptance criteria

- This is a refactor. Every observable behavior of the payments service stays
  exactly the same: return values, persisted state, ledger postings, events,
  and error types and messages.
- The visible test suite still passes.

You're working with an older, smaller model with limited context. Plan the
steps for it.
