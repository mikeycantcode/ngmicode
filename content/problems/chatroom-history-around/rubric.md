## Intended approach
Reuse `this.access.assertRead` first, then validate `limit` with an explicit integer check (not `parseLimit`, which
uses the 200 max and a different message), then load and validate the anchor (`db.messages.get`, which must not be
deleted, must have `parentId === null`, and must match `channelId`). Build the list of eligible positions from
`db.timeline.channel(channelId)`, skipping deleted messages, and find the anchor index. Then compute
`before`/`after` with redistribution, slice, and return oldest-first with the two flags.

## Key files
- `src/services/historyService.ts`
- `src/storage/db.ts` (`MessageTimeline`: positions are already sorted by `(createdAt, id)`)
- `src/policy/access.ts` (`assertRead`, `message()`, which throws `NotFoundError("message not found")` for deleted messages)
- `src/util/errors.ts`

## Traps
- **Order of checks.** Access must come before the limit check, and the limit check before the anchor check. Otherwise an outsider can probe private message ids by error message.
- **Reusing `parseLimit`** gives the wrong bound (200) and the wrong message. A vague spec ("validate like history()") invites this.
- **Anchor validity**: a thread reply id, a message from another channel, and a deleted message all have to produce the same `NotFoundError`. `access.message()` covers only the deleted case.
- **Odd slot to the newer side**, plus redistribution in both directions.
- **Oldest-first output.** An agent told to mirror `history()` will return newest-first.
- Deleted messages must be excluded *before* counting slots and computing `hasMore*`. Otherwise the window comes up short or a flag is wrong.
- Same-timestamp messages: the anchor index must be found by id within the timeline order, not by comparing `createdAt`.

## Strong signals
- Breaks the work into explicit numbered steps with exact error strings. Calls out the order of checks and the output order.
- Specifies the redistribution with a formula or a worked example, and asks for tests at both ends of the channel and with deletions.
- Reviews the code for off-by-one errors in the slice math.

## Weak signals
- "Add an around() like history() but centered". Vague delegation that lets the agent guess.
- Doesn't verify the edge cases (anchor near the start or end, limit 1, even vs odd limit).
- Accepts a full table scan or a solution built on `history()` pages.

## Follow-up questions
- How would you expose this as an API command, and what should the cursor story be for scrolling further in either direction from the window?
- What happens if the anchor is deleted while the client is scrolling? What should the client do with `message not found`?
- The timeline is an array per channel. What's the complexity of `around()` with 1M messages, and how would you index it?
- Why do outsiders get `channel not found` rather than `message not found`?
