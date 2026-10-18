## Intended approach
Find the path `Fanout → ConnectionHub.deliver → OutboundQueue.enqueue / drain`. Thread `config.delivery.maxQueue`
into the hub and queues: the hub is constructed in `createApp` with only a logger today. In `enqueue`, implement
coalesce → append-if-room → full-queue policy, operating only on `items` (waiting) and never on the frame the
drain loop has already shifted out (in flight). In `drain`, wrap `send` in a bounded retry loop (3 attempts) before
closing with `send_failed`. Keep the single-drainer invariant: the `draining` flag stops two concurrent sends on
one connection. Write deterministic tests with `FakeConnection` manual mode.

## Key files
- `src/delivery/outboundQueue.ts` (most of the work), `src/delivery/hub.ts`, `src/delivery/fanout.ts`
- `src/delivery/connection.ts` (`Frame.ephemeral`), `src/domain/types.ts` (`EPHEMERAL_EVENTS`)
- `src/config.ts` (`delivery.maxQueue`, which the code comments say is unenforced), `src/app.ts` (wiring)
- `src/delivery/fakeConnection.ts`

## Traps
- **Counting the in-flight frame** against `maxQueue`, or coalescing against it. Because the drain loop `shift()`s before awaiting, the in-flight frame is naturally out of `items`. Agents that add a separate "pending" structure often get this wrong.
- **Coalesce position**: remove the old frame and append the new one. Replacing in place changes the order, and a hidden test checks the order.
- **Retry re-entrancy**: retrying by re-enqueueing at the tail reorders frames. Retrying asynchronously while `draining` is false lets a second drain loop start, which duplicates sends.
- **Close side effects**: `slow_consumer` must discard the queue and unregister from the hub, so presence goes offline. Calling `conn.close()` directly skips the hub bookkeeping.
- A pending `send()` rejected by `close()` must not trigger retries or a second close reason. The reason must stay `slow_consumer`.
- Not wiring `maxQueue` from config, for example by hard-coding 100. A hidden test uses `maxQueue: 3`.

## Strong signals
- Draws or states the state machine (waiting / in-flight / closed) before delegating. Gives the agent the precise step order.
- Uses `FakeConnection` manual mode and `setManual` to write deterministic tests for each rule. Checks `attempts` vs `received` for retries.
- Considers frames already queued when a connection closes, and concurrency between `enqueue` during an awaited `send`.

## Weak signals
- Uses `setTimeout`-based tests or real delays. Tests only the happy path.
- Accepts an implementation that drops durable frames silently instead of disconnecting.

## Follow-up questions
- After a `slow_consumer` disconnect, how should the client resync? What would you add (e.g. a resume token based on `seq`)?
- Should retries back off? What does an immediate retry cost on a truly dead socket, and where would you put the delay without blocking other connections?
- Coalescing changes `seq` order. How should clients treat gaps in `seq` for ephemeral vs durable frames?
- How would you choose `maxQueue` in production? What metrics would you emit?
