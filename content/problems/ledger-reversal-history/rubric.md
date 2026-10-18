## Intended approach
Read the README's "Time" and "Immutability of history" conventions. Then trace
`POST /journal/entries/:id/reverse` → `JournalService.reverse` → `post`. Notice that
the overlay passes `postedAt: original.postedAt`. The reversal is back-dated into
January, so `getBalance(asOf Jan 31)` now nets the duplicate to zero. The fix is a
one-line deletion: let `post` default `postedAt` to `clock.now()`. Also fix the
misleading doc comment. A strong candidate explains that `asOf` filters on `postedAt`.
They explain that the reversal must be a new fact in the open period, and that
`createdAt` is irrelevant to balances.

## Key files
- `src/services/journalService.ts` (`reverse`)
- `src/services/balanceService.ts`, `src/services/statementService.ts`, `src/services/reportService.ts` (`asOf` semantics; read only)
- `README.md` conventions

## Traps
- **Misleading comment** claims finance asked for back-dating (LEDG-187). The agent may
  "preserve intended behavior" and change balances or reports instead.
- **Wrong fix #1**: filter out entries that have `reversedBy` (or `reversalOf`) in
  `getBalance`/trial balance. This *also* changes history: January would lose the
  original entry entirely.
- **Wrong fix #2**: switch `asOf` filtering to `createdAt`. That breaks deliberate
  back-dated adjustments and every statement.
- Forgetting the statement acceptance criterion: the reversal line must appear in
  February's statement.

## Strong signals
- Has the agent explain the data flow before changing anything. Asks "what is postedAt for?"
- Reproduces with a small scenario (post at t1, reverse at t2, query asOf between).
- Distrusts the comment and checks the README invariant.
- Keeps the diff minimal.

## Weak signals
- Accepts the agent's first theory without checking it against the README.
- Large rewrites of balance or report code.
- Explanation is vague ("timestamps were wrong").

## Follow-up questions
- When *should* an accountant back-date an entry? How would you allow it safely (period locks, approvals)?
- If a period were formally closed, where would you enforce "no postings with postedAt ≤ close"?
- What about entries that were already reversed with the old code? How would you find and repair them?
- Why does the ledger keep both `postedAt` and `createdAt`? Give a query that needs each.
