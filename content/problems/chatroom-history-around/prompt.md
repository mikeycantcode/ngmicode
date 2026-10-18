# "Jump to message"

When a user clicks a search result or a permalink, the client opens the
channel scrolled to that message. It needs a window of history *around* the
message, not the newest page. Add this method to `HistoryService` in
`src/services/historyService.ts`:

```ts
around(actorId: string, channelId: string, messageId: string, limit: number): {
  messages: Message[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}
```

Your instructions to the agent are graded for precision. You're scored on how precisely you delegate.

## Rules

**Checks, in this order**
1. Access: the actor must be able to read the channel. Use the same check and errors as `history()`.
2. `limit` must be an integer from 1 to 50 inclusive. Otherwise throw
   `ValidationError("limit must be between 1 and 50", "limit")`.
3. The anchor message must exist, must not be deleted, must be a top-level message (not a thread reply), and must belong to `channelId`. Otherwise throw `NotFoundError("message not found")`.

**Which messages are eligible**
- Use the same messages that `history()` returns: top-level and not deleted. Order them by `(createdAt, id)`. Messages can share a `createdAt`.

**Window**
- Always include the anchor.
- Split the remaining `limit - 1` slots: `before = floor((limit - 1) / 2)` older messages and `after = (limit - 1) - before` newer messages. The newer side gets the odd slot.
- If one side has fewer eligible messages than its share, give the unused slots to the other side, as far as that side has messages.

**Result**
- `messages` is **oldest first**. Note that `history()` returns newest first.
- `hasMoreBefore` is `true` if at least one eligible message is older than the first returned message. `hasMoreAfter` is the same for newer messages.

## Example

The channel has m1…m10, each 1 second apart:
- `around(m5, 4)` returns `[m4, m5, m6, m7]`, with `hasMoreBefore: true` and `hasMoreAfter: true`.
- `around(m2, 5)` returns `[m1, m2, m3, m4, m5]`, with `hasMoreBefore: false` and `hasMoreAfter: true`.

## Constraints

- Only `src/services/historyService.ts` should change. Don't change `history()`'s behavior.
- Don't scan the whole `messages` table. Use the channel timeline, as `history()` does.
- Visible tests must keep passing.
