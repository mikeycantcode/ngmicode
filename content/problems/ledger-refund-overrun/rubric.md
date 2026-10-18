## Intended approach
Reproduce with two refunds of 6000 on a 10000 capture. Find
`PaymentService.refund`: the guard compares one refund against `capturedAmount`
and ignores `refundedAmount`. Change it to compare against
`capturedAmount - refundedAmount`, and put the remaining amount in the message.
The guard must run *before* `journal.post`. Revert the `>=` status
check to `===` (or leave it; with the guard it's equivalent, and a good candidate
notices it was masking the problem).

## Key files
- `src/services/paymentService.ts` (`refund`)
- `src/api/handlers/payments.ts` (read only; shows the API just delegates)
- `tests/payments.test.ts` (existing refund test)

## Traps
- **Band-aid in the API handler**: the weak agent may add the check in
  `refundPayment` only. The prompt says batch jobs call the service directly.
- **Check after posting**: moving the guard below `journal.post` leaves an orphan
  refund entry when the request fails.
- **Message**: forgetting to report the remaining amount.
- The `>=` in the status line silently marks over-refunded payments as `refunded`.
  That hides the bug in dashboards.

## Strong signals
- Gives the weak agent the exact file and function once it is located, plus the
  invariant in one sentence (`refundedAmount + amount <= capturedAmount`).
- Asks for a regression test for two partial refunds.
- Checks the ledger side (wallet and merchant balances), not just the status code.

## Weak signals
- Lets the agent search the whole repo repeatedly and lose context.
- Accepts a fix in the handler.
- No reproduction or test.

## Follow-up questions
- Two refund requests for 6000 arrive concurrently on a multi-instance deployment. What stops both succeeding?
- Should the fee be refunded proportionally? What would change in the postings?
- How would you detect and repair payments that were already over-refunded in production?
- Why is the check in the service rather than in a database constraint, or both?
