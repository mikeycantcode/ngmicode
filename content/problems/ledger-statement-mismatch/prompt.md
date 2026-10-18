# Statement doesn't match the balance

Support escalated this ticket (paraphrased):

> Alice downloaded her March wallet statement. When she tops up, the running
> balance goes **down**, and when she pays a merchant it goes **up**. The
> closing balance doesn't match the balance shown in the app
> (`GET /accounts/:id/balance?asOf=…`). Also, a top-up that landed at exactly
> midnight on March 1 seems to be counted **twice**: once in the opening
> balance and once as a line.

The statement endpoint is `GET /accounts/:id/statement?from=…&to=…`. Several
merchant partners reconcile against it, so it has to be right for **every**
account type, not just wallets.

## The ask

Find the root cause(s) and fix them. Then tell us in the chat what was wrong and
why the existing tests didn't catch it, or whether they did.

## Acceptance criteria

- For any account and any range, the statement's `closing` equals
  `getBalance(account, { asOf: to })`.
- `opening` equals the balance as of just before `from`. Both bounds are
  inclusive, so an entry exactly at `from` appears once, as a line.
- Each line's `change` and running `balance` use the same sign convention as
  the account's reported balance.
- No change to the statement's response shape.
