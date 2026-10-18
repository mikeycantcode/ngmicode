# Cross-currency payments

We're launching in the eurozone. EUR wallet holders want to pay our existing
US merchants, whose payables are in USD. Today the payment service rejects any
payment where the customer and merchant currencies differ.

## The ask

Support payments where the **merchant's account currency differs from the
customer's**.

- The payment is denominated in the **customer's** currency. Authorization,
  void, and expiry work exactly as today, in that currency.
- **Capture** converts the captured amount into the merchant's currency (the
  *settlement currency*) using the FX rate in effect **at capture time**. The
  processing fee is computed on the settlement amount and booked in the
  settlement currency.
- **Refunds** are requested in the payment currency, and the customer gets
  exactly that amount back. The merchant is debited at the **rate locked at
  capture**, not today's rate. Once a payment is fully refunded, the merchant
  must have given back exactly what they received from the capture, no more
  and no less, however the refunds were split.
- If no rate is available at capture, respond `422 no_rate`. The payment stays
  `authorized` and nothing is posted.
- The payment resource (service and API) exposes `settlementCurrency` and
  `settlementAmount`. `settlementAmount` is `null` until capture.
- Same-currency payments behave exactly as before.

## Constraints

- Every journal entry must balance **per currency**. The ledger enforces this,
  so you'll need to model the currency exchange in the books.
- Use the existing FX service and rate data. Don't change its conversion rules.
