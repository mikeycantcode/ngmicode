# Archive channels

Large customers end up with hundreds of dead project channels. They want to
**archive** a channel. An archived channel disappears from the sidebar and
becomes read-only, but its history stays searchable and readable. Ship this
end to end in the chat backend.

## Requirements

**Commands**
- `conversations.archive { channelId }` and `conversations.unarchive { channelId }` both return `{ ok: true, channel }`. Both are idempotent.
- The public channel shape gains `archived: boolean`.
- `conversations.list` hides archived channels unless the caller passes `includeArchived: true`.

**Who may archive**
- The same people who may rename the channel: workspace admins and owners, and the channel's creator. Anyone else gets `forbidden`.
- `#general` and DMs can't be archived. Return `invalid_arguments`.

**Archived means read-only**
- Nothing new can be written into an archived channel. Every attempt fails with error code **`channel_archived`**. This includes messages arriving through integrations.
- Admins can still **delete** messages in an archived channel, for moderation.
- Reading still works: history, threads, search, and the member list.
- Unarchiving restores normal behavior.

**Real time**
- When a channel is archived, connected members get a `channel.archived` frame with `{ channelId }`.

## Notes

- You don't know this codebase. Use the agent to orient, but you own the plan.
- Keep the existing conventions for errors, events, and authorization.
- Visible tests must keep passing. Add tests for what you build.
