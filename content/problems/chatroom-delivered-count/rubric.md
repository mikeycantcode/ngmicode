## Intended approach
Trace: `ApiRouter.handle` (auth → `validate` → `RateLimiter.check` → handler) → `chat.postMessage` handler
(`api/commands.ts`) → `MessageService.post`, which calls `AccessService.assertPost` (authz), escapes text, parses
mentions, checks broadcast permissions, writes to `Db` and the timeline, and emits `message.created` on the
**synchronous** `EventBus`. Subscribers run in registration order: search indexing, typing clear, notifications,
outgoing webhook queueing, and the delivery bridge (`registerDeliveryBridge` in `delivery/fanout.ts`). The bridge
calls `Fanout.publish`, then `ConnectionHub.deliver` for each connection (seq assignment), then
`OutboundQueue.enqueue`. Draining is **asynchronous**, with one in-flight `send()` per connection, which gives
per-connection ordering. `Fanout.publish` already returns the count, but the bridge throws it away. Feature: capture
that count, for example by having the bridge record it per message id and expose a lookup, or by returning it via
the app. Then put it in the handler response. Don't publish a second time from the handler.

## Key files
- `src/api/router.ts`, `src/api/commands.ts`
- `src/services/messageService.ts`, `src/util/events.ts`, `src/app.ts` (subscriber order)
- `src/delivery/fanout.ts` (bridge + `Fanout.publish` return value), `src/delivery/hub.ts`, `src/delivery/outboundQueue.ts`

## Traps
- **Counting members instead of connections.** This is the most common small-model mistake. A hidden test has a user with two tabs and a member with none.
- **Publishing again from the handler** to get the count. This sends duplicate `message.created` frames. A hidden test checks for exactly one frame per connection.
- Counting all connected users in the workspace (`hub.connectionCount`), which includes non-members such as the guest.
- Forgetting thread replies. They go through the same path, so it's fine if the capture is in the bridge.
- Describing the bus as async. It is synchronous, and only queue draining is async.

## Strong signals
- Has the agent produce a call-chain map with file:line references, then verifies the key claims by reading the code.
- Notices `Fanout.publish` already returns the count, and feeds the weak agent the exact files and the plan in small steps.
- Asks for a test with multiple connections per user and a non-member connection.

## Weak signals
- Lets the agent free-roam and accepts an explanation that is wrong about sync/async or misses subscribers (notifications, search, webhooks).
- Accepts a solution without checking for duplicate frames.

## Follow-up questions
- `deliveredTo` counts *queued*, not *written*. How would you report actual delivery, and what would it cost?
- The bus swallows subscriber errors. If search indexing throws, what does the user see? Is that the right call?
- Why is per-connection ordering enough? When would a client need ordering across connections?
- If delivery moved to a separate process behind a message broker, what happens to `deliveredTo`?
