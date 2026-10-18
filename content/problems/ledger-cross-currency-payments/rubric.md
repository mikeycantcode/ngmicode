## Intended approach
Orient on four modules: `PaymentService` (lifecycle and posting scheme), `FxService.convert`,
`domain/journal.ts#validateDraft` (per-currency balance), and the
`fx_clearing` system account kind that already exists in `domain/account.ts` but is unused.
Relax the currency check in `authorize` for the merchant only. Record `settlementCurrency`
(the merchant's currency) on the payment. On capture, convert *before* posting (so a missing
rate posts nothing), compute the fee on the settlement amount, and post one entry with
clearing legs: Dr holds(P) / Cr fx_clearing(P), Dr fx_clearing(S) / Cr merchant(S) net /
Cr fees(S). Store `settlementAmount`. On refund, compute the merchant debit from the locked
ratio `settlementAmount / capturedAmount` with exact rounding. The refund that completes the
payment takes the exact remainder (`settlementAmount − settlementRefunded`). Mirror the
clearing legs. Wire `FxService` into `PaymentService` in `services/index.ts`. Update the
serializer.

## Key files
- `src/services/paymentService.ts`, `src/services/index.ts`
- `src/services/fxService.ts` (read; reuse `convert`)
- `src/domain/payment.ts`, `src/domain/account.ts` (`fx_clearing`), `src/domain/journal.ts`
- `src/api/serializers.ts`
- `src/lib/numeric.ts` (`divRound`)

## Traps
- **Unbalanced entries**: posting EUR debit and USD credit in one entry without clearing
  legs is rejected by `validateDraft`. Agents sometimes "fix" this by weakening the validator.
- **Refund at today's rate**: calling `fx.convert` again on refund. The merchant then gives
  back more or less than they received.
- **Rounding drift on split refunds**: rounding each partial refund independently (e.g.
  333 + 333 + 334 EUR cents at 1.5) sums to 1501 USD cents vs 1500 captured. The final
  refund must take the remainder.
- **Fee in the wrong currency** (computed on the EUR amount, or booked to a EUR fees account).
- **Conversion after a partial post**, or capture state changed before `convert` throws. The
  payment must stay `authorized`.
- **Breaking same-currency flows** (visible tests cover these).

## Strong signals
- Has the agent write out the postings for capture and refund per currency before coding.
- Discovers the unused `fx_clearing` kind and uses it.
- Proves "merchant gives back exactly what they got" with a split-refund test.
- Checks the per-currency trial balance after each step.

## Weak signals
- Lets the agent loosen `validateDraft` or post two unrelated entries without clearing.
- Only tests a single full refund at an unchanged rate.

## Follow-up questions
- Who bears FX risk between capture and refund here? How would you show that in reporting (FX gain/loss account)?
- The clearing accounts accumulate balances. What does a non-zero fx_clearing balance mean, and how would treasury settle it?
- Should the fee be refunded on cross-currency refunds? How would partial fee refunds round?
- How would you make this work with partial captures or multiple captures?
