# Backpressure for slow clients

Last week a customer's integration opened a WebSocket and then never read
from it. Its outbound queue grew without bound until the node ran out of
memory and every connection on it dropped. The real-time layer needs
backpressure. Separately, mobile sockets often hit transient write errors.
Today one failed write kills the connection.

Implement the rules below in the real-time delivery layer.

## Rules

Each connection has at most one frame **in flight** (being sent) and a queue of
**waiting** frames. `config.delivery.maxQueue` (default 100) limits the number of
*waiting* frames. The in-flight frame doesn't count. Frames of type `typing` and
`presence.changed` are **ephemeral**. All other frames are **durable**.

When a new frame is queued for a connection, apply these steps in order:

1. **Coalesce.** If the new frame is `typing` and a *waiting* `typing` frame has the same `payload.channelId` and `payload.userId`, remove the waiting one. If the new frame is `presence.changed` and a *waiting* `presence.changed` frame has the same `payload.userId`, remove the waiting one. The in-flight frame is never touched.
2. If fewer than `maxQueue` frames are waiting, append the new frame to the end.
3. Otherwise the queue is full:
   - If any waiting frame is ephemeral, drop the **oldest** waiting ephemeral frame and append the new frame.
   - Otherwise, if the new frame is ephemeral, drop the new frame.
   - Otherwise (the new frame is durable and all waiting frames are durable), **disconnect** the client with reason `slow_consumer`. Discard its queue and remove it from the hub, exactly as an existing close does.

**Write failures.** If `send()` rejects, retry the *same* frame immediately, up to **2 more times** (3 attempts in total). Frames behind it keep waiting, and order is preserved. If all three attempts fail, close the connection with reason `send_failed`, as today.

Existing guarantees must hold: each connection receives frames in order, and
one slow connection never delays another.

## Notes

- `FakeConnection` (`manual` mode, `setManual`, `release`, `failNext`) lets you simulate slow and flaky clients deterministically in tests.
- Visible tests must keep passing. Add tests for each rule.
