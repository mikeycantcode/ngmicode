## Intended approach
Create a read-state module (e.g. `ReadStateService`) that holds `channel:user → CursorPosition` markers and is
driven by bus events: `channel.member_joined` initializes the marker at the timeline's last position, which covers
every join path (create, join, invite, DM open, workspace add → #general); `channel.member_left` clears it;
`message.created` (top-level only) advances the author's marker and pushes `unread.updated` to other members;
`message.deleted` pushes updates to members for whom the message was unread. Compute counts by walking
`db.timeline.channel()` after the marker, skipping deleted messages and the user's own posts, and classifying mentions
from `message.mentions`. Expose `mark`/`unreads` in commands, with `assertRead` plus a membership check. Use
`fanout.publishToUsers([userId], ...)` for per-user frames. Wire everything in `createApp` before any events fire.

## Key files
- `src/app.ts` (wiring and subscriber order), `src/util/events.ts`, `src/domain/types.ts` (events, `Mention`)
- `src/storage/db.ts` (`MessageTimeline`), `src/domain/cursor.ts` (`compareMessagePos`)
- `src/services/channelService.ts`, `src/services/workspaceService.ts` (every place `channel.member_joined` is emitted)
- `src/delivery/fanout.ts`, `src/delivery/hub.ts`, `src/api/commands.ts`, `src/policy/access.ts`

## Traps
- **Join initialization through every path.** Hooking only `channels.join` misses invite, create, DM open, and workspace onboarding. Defaulting a missing marker to "beginning of time" makes all old history unread. A hidden test joins after messages exist.
- **Mention semantics.** `@here` is excluded and `@channel`/`@everyone` count. Mentions come from canonical tokens (`message.mentions`), not from raw text matching.
- **Thread replies** are emitted as `message.created` too, and must not count or move markers.
- **Deletion** must decrement, and should notify only users for whom the message was unread.
- **Frames must be per-user.** Publishing to the channel would leak everyone's counts and would also hit the author.
- Marker monotonicity: `mark` with an older message is a no-op.
- Same-millisecond posts: the marker must be a `(createdAt, id)` position, not just a timestamp.

## Strong signals
- Spends early time tracing how membership and messages flow through the bus, and decides on an event-driven design.
- Gives the agent a written plan with the event list and the count definition, then reviews the code against it.
- Tests the join-after-history case, deletion, mention variants, and the frame audience.
- Discusses complexity: counts are O(unread) per change, and caching or incremental counters are possible.

## Weak signals
- Computes counts from `Date.now()` or timestamps alone. Sends frames via `fanout.publish(channelId, …)`.
- Doesn't test any frames. Lets the agent add read state onto `ChannelMember` rows without considering the copy semantics of `Table`.

## Follow-up questions
- Recomputing counts walks the timeline after the marker. For a user who's been away for a year in a busy channel, how would you make this O(1)?
- A user has the app open on two devices and reads on one. How does the other device's badge clear?
- Should editing a message to add `@dave` create a mention badge for dave? What does your implementation do?
- How would you persist markers so a server restart doesn't make everything unread or everything read?
