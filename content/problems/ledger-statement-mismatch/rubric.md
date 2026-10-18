## Intended approach
Reproduce first: fund a wallet at exactly `from`, pay a merchant, and compare the
statement with `getBalance`. The visible test `builds a statement with running
balances` already fails on this starter. A strong candidate notices that and uses it.
There are two independent defects in `StatementService.getStatement`:
1. `opening` uses `asOf: from`, but lines include `postedAt >= from`. Entries at
   exactly `from` are double-counted. The fix is `asOf: from - 1` (the bounds are
   inclusive epoch ms).
2. The running change is hand-rolled as debit-positive. Balances are reported on the
   account's normal side (README), so liabilities and revenue run backwards. The fix
   is to reuse `signedAmount(account.type, …)` from `domain/account.ts`.

## Key files
- `src/services/statementService.ts`
- `src/services/balanceService.ts` (the source of truth for sign and `asOf`)
- `src/domain/account.ts` (`signedAmount`, `NORMAL_SIDE`)
- `README.md` → Conventions: normal-side balances, inclusive bounds

## Traps
- **Fixing one bug and declaring victory.** The ticket mentions both symptoms.
- **Patching the sign for liabilities only** (`if (type === "liability")`). Revenue
  and equity are credit-normal too. Reuse the helper.
- **Negating the whole statement**, or changing `opening` to `getDebitBalance`. That
  makes the statement self-consistent but no longer matches `/balance`.
- **Changing `getBalance`** to fit the statement. It breaks the API and the trial balance.
- Fixing the boundary by excluding `postedAt === from` from the lines. That breaks
  "both bounds inclusive".

## Strong signals
- Writes a failing reproduction (or runs the failing visible test) before editing.
- Asks the agent to compare the two code paths (statement vs balance) rather than
  inspect each in isolation.
- Checks a credit-normal account other than a wallet (revenue/fees) and a
  debit-normal one (cash).

## Weak signals
- Lets the agent rewrite the whole service.
- Doesn't check the boundary case and misses the double count.
- Never runs the visible suite.

## Follow-up questions
- Why does `opening` use `from - 1`? What breaks if timestamps get sub-millisecond precision?
- `getStatement` reads all of an account's entries. How would you make this fast for a 1M-entry account?
- How would you write a property test that would have caught both bugs?
- Should the statement show running balances for multi-posting entries per posting or per entry?
