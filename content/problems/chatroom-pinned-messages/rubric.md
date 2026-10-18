## Intended approach
Orient through `app.ts`, `api/commands.ts`, a service such as `reactionService`, and `policy/`. Add a `pins`
`Table` to `Db` keyed `channelId:messageId`. Add a `PinService` that uses `AccessService` (`assertRead` for list,
`assertPost` for add/remove) plus an explicit guest check. Validate that the message is top-level, not deleted, and
in the given channel. Handle deletion either by filtering deleted messages in `list` or by subscribing to
`message.deleted` and removing the pin. Register three commands with `v.id(...)` schemas, wire the service in
`createApp`, and add `too_many_pins` as an `AppError` code.

## Key files
- `src/app.ts`, `src/storage/db.ts`, `src/api/commands.ts`, `src/api/serializers.ts`
- `src/policy/access.ts`, `src/policy/permissions.ts`
- `src/services/messageService.ts` (delete path / `message.deleted` event)

## Traps
- **Cross-channel IDOR.** If the message's `channelId` isn't checked against the param, a member of `#general` can pin a message from private `#exec` into `#general`. `pins.list` then leaks its content. A hidden test covers this.
- **Guests in channels they belong to** pass `assertPost`. The guest rule needs its own check, ideally in `permissions.ts`.
- **Deleted messages lingering in pins.** The second code path is the delete flow.
- Re-pin idempotency: overwriting `pinnedBy`/`pinnedAt` changes list order and violates the contract.
- Table rows are copies. Mutating a fetched row has no effect.

## Strong signals
- Spends the first minutes mapping the architecture, then gives the agent a crisp plan: table, service, policy function, commands, wiring, tests.
- Puts the guest rule in `permissions.ts` (`canPin`) rather than inline in the handler.
- Writes tests for the IDOR and the delete interaction, not just the happy path.
- Notices the 100-pin limit can't be tested easily through the API because of the rate limiter, and tests it at the service level.

## Weak signals
- Lets the agent put business logic in the command handler and read `db` directly from `api/`.
- Uses a new ad hoc error shape instead of `AppError` codes.
- No verification beyond "it compiles".

## Follow-up questions
- Why key pins by `channelId:messageId` rather than `messageId`? When might a message be pinned in two places?
- Would you push `pin.added`/`pin.removed` to clients? Through which existing mechanism?
- How would you make `too_many_pins` race-free with a real database and concurrent pinners?
- What should happen to pins when a channel is converted from public to private?
