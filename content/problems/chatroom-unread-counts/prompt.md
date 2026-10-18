# Unread & mention badges

The sidebar needs badges: a bold channel name when there are unread messages,
and a red count when someone mentioned you. Today the backend has no notion
of what a user has read. Build read state end to end, including live badge
updates over the real-time connection.

## API

- `conversations.mark { channelId, messageId }` sets the caller's read marker in that channel to that message. It returns `{ ok: true, unreadCount, mentionCount }` for that channel after the change.
  - The caller must be a member of the channel. A non-member gets `forbidden`, or `not_found` for private channels, following the usual convention.
  - The message must be a top-level, non-deleted message in that channel. Otherwise return `not_found`.
  - Markers **never move backwards**. Marking an older message is accepted but changes nothing.
- `conversations.unreads { workspaceId }` returns `{ ok: true, channels: [{ channelId, unreadCount, mentionCount }] }`. It covers only channels where the caller is a member and `unreadCount > 0`, sorted by channel name.

## Definitions

- **Unread** messages are top-level, non-deleted messages in the channel, after the user's marker in `(createdAt, id)` order, and **not authored by the user**. Thread replies never count.
- **Mention** messages are unread messages that mention the user directly or use `@channel` / `@everyone`. `@here` does **not** count toward mentions.
- When a user **joins** a channel, their marker starts at the channel's latest message. Older history is not unread. This applies however they joined.
- When a user **posts** a top-level message, their marker moves to that message.

## Live updates

Whenever a user's counts for a channel change, push a frame of type
`unread.updated` with payload `{ channelId, unreadCount, mentionCount }` to
**that user's** connections only. Counts change when someone else posts, when a
message that was unread for them is deleted, or when they call `conversations.mark`.
An author must not receive `unread.updated` for their own post.

## Notes

- Large unfamiliar codebase. Plan before you delegate.
- Visible tests must keep passing. Add your own.
