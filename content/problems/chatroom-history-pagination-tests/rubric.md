## Intended approach
Build the two helpers exactly to contract. Write an invariant-style test: for many (count, pageSize, stepMs)
combinations, `collectHistory` returns every non-deleted top-level message exactly once, in strict
`(createdAt, id)` descending order. The `stepMs: 0` case fails. Root cause: `HistoryService.history` compares only
`createdAt` at the cursor boundary (`pos.createdAt >= before.createdAt → skip`), so messages sharing the boundary
message's timestamp are skipped. The comment claiming timestamps are unique is false, because bots and webhooks
post in bursts within one millisecond. Fix: use `compareMessagePos(pos, before) >= 0`. The cursor already carries
the id.

## Key files
- `src/services/historyService.ts` (bug + misleading comment)
- `src/domain/cursor.ts` (`compareMessagePos`; the cursor already encodes the id)
- `src/storage/db.ts` (`MessageTimeline` sorts by `(createdAt, id)`)
- `tests/fixtures.ts` (`setup()`, `ManualClock`)
- New: `tests/helpers/seed.ts` and a pagination test file

## Traps
- **Helper contract details**: advance the clock *before each* post (including the first), use 1-based `i`, and return messages in posting order. A weak agent often advances after posting or uses 0-based indices. The hidden tests pin these down.
- Seeding through `db.messages.insert` bypasses the timeline. Then history sees nothing, and the bug is invisible.
- Tests that only use the default `stepMs` pass on the buggy code. The candidate must think about equal timestamps.
- Changing the cursor format to "fix" it (e.g. adding a counter), which breaks existing cursors. The id is already there.
- Fixing the comparison but leaving the false comment.

## Strong signals
- Gives the weak agent small, concrete steps: first the helper with its exact contract, then one parameterized invariant test, then run it.
- Formulates the property ("each message exactly once, in order") rather than enumerating examples.
- After the failure, has the agent print the boundary page to localize the bug before fixing it.
- Notes that search showed the messages, which proves the data exists and the bug is in pagination.

## Weak signals
- Asks the agent to "write tests for pagination" without a plan. Gets a dozen example tests with distinct timestamps, all passing.
- Fixes the bug by inspection without a failing test first, or never writes the helper as specified.

## Follow-up questions
- How would you make the invariant test cover cases you didn't think of, for example by randomizing with a seeded RNG?
- Messages can be inserted out of order (imports, webhook backfills). Does your fix handle a message inserted *behind* an outstanding cursor? Should it?
- What other cursor-based endpoints could have the same bug?
- How would you detect this in production from logs or metrics?
