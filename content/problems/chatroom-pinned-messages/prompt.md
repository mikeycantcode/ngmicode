# Pinned messages

Channels need pinned messages, such as the on-call rotation or the release
checklist. The client team has agreed the wire contract below. Build the
backend for it: storage, service, authorization, and commands. Follow the
patterns the codebase already uses.

## Commands

All commands go through the API router (`app.api.handle({ command, actorId, params })`).

| command | params | success response |
|---|---|---|
| `pins.add` | `channelId`, `messageId` | `{ ok: true, pin }` |
| `pins.remove` | `channelId`, `messageId` | `{ ok: true }` |
| `pins.list` | `channelId` | `{ ok: true, pins: Pin[] }` |

The shape of `pin` is `{ channelId, messageId, pinnedBy, pinnedAt }`. Each item in
`pins.list` is that shape plus `message`, the message in the same public wire
format the other commands return.

## Rules

- `pins.list` returns the most recently pinned first.
- Pinning an already-pinned message succeeds and returns the **existing** pin unchanged (original `pinnedBy` and `pinnedAt`).
- Unpinning a message that isn't pinned returns error `not_found`.
- To read pins, the actor must be able to read the channel. To pin or unpin, the actor must be able to post in it. **Guests can never pin or unpin** (`forbidden`).
- Only top-level messages can be pinned. A thread reply returns `invalid_arguments`.
- The message must belong to the `channelId` given. Otherwise, or if it's deleted, return `not_found`. Don't reveal whether the message exists elsewhere.
- A pinned message that gets deleted no longer appears in `pins.list`.
- A channel can have at most 100 pins. Return error `too_many_pins` beyond that.
- Malformed params return `invalid_arguments`, as for other commands.

## Out of scope

Real-time pin events for clients, and a UI.
