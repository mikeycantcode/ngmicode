## Intended approach
Orient via the README's payments section and the header comment in
`services/paymentService.ts` (it documents the posting scheme). Change `capture` to
take an optional amount and validate it. Compute the fee on the captured amount. Post
one balanced entry: Dr holds for the *full authorized* amount; Cr merchant
(captured − fee); Cr fees; Cr customer wallet (remainder). Separate entries are also
fine. Update the payment and the event payload. In the API handler, accept an
*optional* body. Update the header comment and add tests.

## Key files
- `src/services/paymentService.ts` (`capture`)
- `src/api/handlers/payments.ts` (`capturePayment`)
- `src/api/validate.ts` (`optionalPositiveInt`; reuse)
- `src/domain/journal.ts`, `src/domain/money.ts` (`applyBps`)

## Traps
- **Hold not fully released**: debiting holds for only the captured amount leaves the
  remainder stuck in the holds account. The wallet stays short, and the system account
  shows a phantom liability.
- **Fee on authorized amount** instead of the captured amount.
- **API body handling**: `asObject(c.req.body)` throws on an empty body, which breaks
  existing full captures. The visible API test catches it if they run it.
- **Validation in the handler only**: the service must also reject amounts above the
  authorization (batch and console callers).
- Forgetting `released` in the event (the audit and notification consumers need it).
- Breaking lazy expiry (the TTL check must still run first).

## Strong signals
- Reads the posting-scheme comment, and asks the agent to write the postings out before coding.
- Verifies with balances of all four accounts (wallet, holds, merchant, fees) plus the trial balance.
- Runs the visible suite and adds tests for the edge amounts (0, equal, authorized + 1).

## Weak signals
- Only checks the payment record's fields, not the ledger.
- Lets the agent add a second capture path, or duplicate the fee logic.

## Follow-up questions
- How would you extend this to multiple partial captures? What changes in the state machine?
- Should we release the remainder immediately or at authorization expiry? Customer vs merchant trade-off?
- A partial capture is retried after a timeout. What protects against a double capture here?
- Why one journal entry vs two? What does each choice mean for statements and reversals?
