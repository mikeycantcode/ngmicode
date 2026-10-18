## Intended approach
First, have the agent inventory **every** place a payment status is read or written in
`PaymentService`: `capture`, `void`, `refund`, the private `expire`, and `expireStale`.
Include the implicit behavior: `capture` on an authorized payment past `expiresAt`
lazily expires it (releases the hold, persists `expired`, emits `payment.expired`).
Then it throws `cannot capture payment in status expired`. Write the state machine
module as a lookup table, unit-check it, then migrate one method at a time and run the
visible tests after each step.

## Key files
- `src/services/paymentService.ts`
- `src/domain/payment.ts` (statuses, diagram comment)
- `src/domain/errors.ts` (`InvalidTransitionError`)
- new `src/domain/paymentStateMachine.ts`

## Traps
- **Lazy expiry is not covered by visible tests.** A weak agent rewriting
  `capture` as `transition(p.status, "capture")` drops the TTL check. Or it
  throws without persisting the expiry and releasing the hold.
- **Error messages**: the refund verb for `refund_full`, and the duplicate
  `voided` check, must produce the same text as before.
- **Ordering of checks in `refund`**: status before amount validation. Swapping
  them changes which error a caller sees.
- `expireStale` and `expire` also change status. They're easy to miss with a
  truncated `read_file`.
- Making `transition` mutate the payment or post to the ledger (it should be pure).

## Strong signals
- Has the agent list behaviors *before* touching code. Notices the TTL path.
- Adds a characterization test for expiry (and the error messages) before refactoring.
- Feeds the weak agent one method at a time, with the table pasted in.
- Runs the visible suite after each step.

## Weak signals
- "Refactor payments to use a state machine" in one shot.
- No characterization tests. Trusts that green visible tests mean nothing changed.
- Accepts changed error messages.

## Follow-up questions
- Where does lazy expiry belong now: in the state machine, the service, or a scheduler? Trade-offs?
- How would you add `disputed` (from captured or partially_refunded) and `chargeback`?
- Two requests capture and void the same payment concurrently. Does the state machine help? What would?
- How did you convince yourself the refactor preserved behavior beyond the visible tests?
