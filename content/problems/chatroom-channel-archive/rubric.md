## Intended approach
Map the write paths first: `messages.post` (top-level, replies, and incoming webhooks all go through it),
`messages.edit`, `reactions.add`, `reactions.remove`, `typing.start`, `channels.join`, `channels.invite`,
`channels.setTopic`, `channels.rename`. Add `archivedAt` (or `archived`) to `Channel`. Add a
`channel_archived` `AppError`. Enforce it centrally where possible: `AccessService.assertPost` covers post,
reactions.add, typing and setTopic. Then explicitly cover the paths that don't use `assertPost`: `edit` uses
`access.actor` + `canEditMessage`, `reactions.remove` uses `assertRead`, and `join`/`invite` use their own policy
calls. Add `archive`/`unarchive` to `ChannelService` with `canManageChannel`, guards for general and DMs, an event,
a bridge frame, the serializer field, and a list filter. Add the commands.

## Key files
- `src/domain/types.ts` (Channel, events), `src/util/errors.ts`
- `src/policy/access.ts`, `src/policy/permissions.ts`
- `src/services/channelService.ts`, `messageService.ts`, `reactionService.ts`, `presenceService.ts` (typing)
- `src/delivery/fanout.ts` (bridge), `src/api/commands.ts`, `src/api/serializers.ts`
- `src/integrations/incomingWebhooks.ts` (maps `AppError.code` into the response body)

## Traps
- **Write paths that bypass `assertPost`**: `edit`, `reactions.remove`, `join`, `invite`. An agent that puts the check only in `assertPost` (or only in `post`) leaves these open. The hidden tests cover edit and reaction removal.
- **Webhook path**: it's covered automatically only if the check lives in `messages.post` or `assertPost`. If it's in the command handler, webhook posts still land.
- **Blocking deletes** breaks moderation, which the spec explicitly allows.
- Creation sites for `Channel` (`workspaceService.create`, `channelService.create`, `openDm`) need the new field initialized, or code that compares `archivedAt !== null` misbehaves on `undefined`.
- `conversations.list` filtering must happen after the read-permission filter, not instead of it.

## Strong signals
- Starts by asking the agent to enumerate every code path that mutates channel content, then checks that list against the code.
- Centralizes the rule (an `assertWritable` or archive check inside `assertPost`) and then patches the stragglers deliberately.
- Writes a table-driven test over all write commands.
- Verifies the webhook path explicitly.

## Weak signals
- Implements archive and tests only `chat.postMessage`.
- Puts the check in the API layer only, which bypasses services and webhooks.
- Doesn't notice reactions and edits.

## Follow-up questions
- Should pending outgoing webhook deliveries for an archived channel still be sent? Why or why not?
- How would you handle a client that is mid-typing or has an optimistic send in flight when the archive frame arrives?
- Should archiving remove members, or keep them? What are the implications for notifications and unread counts?
- If archive became async, for example to export history, how would you model the intermediate state?
