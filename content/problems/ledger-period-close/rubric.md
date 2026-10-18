## Intended approach
Orient: find every place a `JournalEntry` is written. `grep` for `journal.insert` /
`repos.journal` shows **two** write paths: `JournalService.post` and
`JournalService.importEntries`. The legacy CSV importer and the payment service go
through one of these. Add a `PeriodService` (state in a repo, per tenant) with
`close`, `closedThrough` and `assertOpen`. Wire it into `createServices` and inject it
into `JournalService`. Guard both write paths. For imports, validate the whole batch
before writing anything. Add an API handler and routes, the `periods:write` scope
(plus `ALL_SCOPES`), and the HTTP mapping for the new error code. Publish
`period.closed`. Test through the API.

## Key files
- `src/services/journalService.ts` (`post`, `importEntries`)
- `src/services/index.ts` (wiring), new `src/services/periodService.ts`
- `src/storage/repos.ts` (state), `src/api/auth.ts` (scope), `src/api/http.ts` (status map)
- `src/app.ts` (`ROUTES`), new `src/api/handlers/periods.ts`
- `src/legacy/csvImport.ts` (uses `importEntries`)

## Traps
- **Second write path**: `importEntries` writes to the repo directly and skips `post`.
  Guarding only `post` leaves the CSV importer able to rewrite closed months.
- **Partial import**: checking inside the insert loop writes the first N entries
  before throwing. "A rejected write must leave nothing behind."
- **Error code → status**: a `ConflictError` with code `period_closed` falls through
  `STATUS_BY_CODE` to **400** unless it is mapped. Using the default `conflict`
  code violates the spec.
- **Boundary**: `postedAt === closedThrough` must be rejected (inclusive).
- **Reversals**: blocking reversals of closed-period entries ("touches a closed
  entry") is wrong. They post now.
- **Scope plumbing**: forgetting `ALL_SCOPES`, so the full-access key gets 403.
- Global (not per-tenant) close state.

## Strong signals
- Starts with "find every write path to the journal" and verifies the list.
- Asks the agent to keep the guard in the service layer, not the API handler.
- Tests the boundary instant, the import path, and tenant isolation.
- Notices the payment flows are unaffected because they post at `now`. Asks what
  happens if `now` is inside a closed period (it can't be, because closes can't be in the future).

## Weak signals
- Implements it as an API-handler check on `postedAt`.
- Doesn't run the visible suite after changing `JournalService`'s constructor.
- Doesn't look at the legacy importer at all.

## Follow-up questions
- How would you support re-opening a period with an audit trail and approvals?
- With a real database and multiple instances, how do you prevent a race between closing and a concurrent back-dated post?
- Should trial balances for closed periods be snapshotted? What does that buy you?
- Your clock is injected. What happens around midnight in different tenant time zones?
