# chatroom — team chat backend (in-process)

The backend of a Slack-style team chat: workspaces, channels, DMs, threads,
reactions, mentions, presence/typing, real-time fan-out to client connections,
search, notifications, and webhook integrations. Everything runs in-process
against in-memory storage so the whole system can be exercised from unit tests.

```
           ┌────────────── api/ ──────────────┐
 request → │ router: auth → validate → rate   │
           │ limit → handler → wire format    │
           └───────────────┬──────────────────┘
                           │ calls
           ┌───────────── services/ ──────────┐      ┌── policy/ ──────────┐
           │ workspace/user, channel, message,│ ───► │ access (loads facts)│
           │ thread, reaction, history,       │      │ permissions (rules) │
           │ presence+typing, notification    │      └─────────────────────┘
           └───────┬───────────────┬──────────┘
                   │ writes        │ emits DomainEvents (util/events, sync)
           ┌── storage/ ──┐        ├──► search/ (indexes messages)
           │ Db + Tables  │        ├──► notificationService
           │ + timeline   │        ├──► integrations/outgoingWebhooks (queued)
           └──────────────┘        └──► delivery/fanout bridge → hub → per-connection
                                         OutboundQueue → Connection.send()
```

## Layout

| Path | What lives there |
|------|------------------|
| `src/app.ts` | Composition root. `createApp({ clock, config, transport })` wires everything and returns the service graph plus `app.api`. |
| `src/config.ts` | Defaults (limits, TTLs, rate-limit buckets). Override per test with `createApp({ config })`. |
| `src/domain/` | Plain data types + domain events + role ranks (`types.ts`), mention parsing (`mentions.ts`), channel-name rules, history cursors, notification previews. |
| `src/policy/` | **All** authorization rules (`permissions.ts`, pure) and `AccessService`, which loads role/membership and throws. |
| `src/storage/` | `Db`: in-memory `Table`s plus `MessageTimeline` (sorted message positions per channel / thread). |
| `src/services/` | Business logic. Services throw `AppError` subclasses and emit events on the bus. |
| `src/search/` | Tokenizer, query parser (`from:@x in:#y`), inverted index, permission-filtered search. |
| `src/delivery/` | Real-time: `ConnectionHub` (connections per user), `OutboundQueue` (per-connection FIFO), `Fanout` + the bus→client bridge, `FakeConnection` for tests. |
| `src/integrations/` | Incoming webhooks (external → channel, signed), outgoing event subscriptions for bots (signed, retried). |
| `src/ratelimit/` | Token bucket + keyed limiter used by the API router. |
| `src/api/` | Command router, schema validation, wire serializers, and every command in `commands.ts`. |

## Conventions

- **Time** comes from the injected `Clock` (epoch ms). Never call `Date.now()` in domain or service code. Tests use `ManualClock`.
- **IDs** are `<prefix>_<6+ digits>` (`u_`, `w_`, `c_`, `m_`, `n_`, `wh_`), sortable, from `IdGenerator`.
- **Errors**: throw `ValidationError` / `NotFoundError` / `ForbiddenError` / `ConflictError` (`util/errors.ts`). The router maps `.code` to `{ ok: false, error: code, message }`.
- **Authorization** goes through `AccessService` / `policy/permissions.ts`. A private channel the actor can't see is reported as `not_found`, not `forbidden`, so its existence doesn't leak.
- **Guests** are only ever in channels they were explicitly invited to. They don't get `#general` and can't read or join other public channels.
- **Message text is canonical**: user input is HTML-escaped (`& < >`) and mentions become tokens (`<@u_000001>`, `<#c_000002>`, `<!here>`). Anything that renders text must go through `domain/preview.ts`.
- **Events** (`util/events.ts`) are synchronous. Subscribers run in registration order (see `app.ts`), and errors in subscribers are swallowed into `bus.errors`.
- **Storage rows are copies**. `Table.get()` returns a copy. Mutating it does nothing, so write back with `update()`.
- Thread replies are **not** part of channel history. They live under their parent in the timeline.

## Real-time delivery

Each connection has its own `OutboundQueue`. Frames are sent one at a time, so a
connection never has two writes in flight. That gives per-connection ordering.
`seq` increases per connection. A failed write closes the connection
(`send_failed`). Ephemeral frames (`typing`, `presence.changed`) are marked
`ephemeral: true`.

Known gap (CHAT-388): queues are unbounded. `config.delivery.maxQueue` is defined but not enforced.

## Webhooks

Incoming: `POST /hooks/:id` maps to `incomingWebhooks.receive({ hookId, headers, body })`.
Requests are signed with `x-steer-signature: v1=<hmacHex(secret, rawBody)>`.
v1 has no timestamp, so it is replayable. CHAT-341 tracks a timestamped v2 scheme.
`util/hash.ts` provides `hmacHex` and `timingSafeEqual`. The sandbox has no
`crypto`, so these are home-grown and **not** cryptographically strong.

## Tests

`tests/fixtures.ts#setup()` builds the standard world (alice owner, bob admin,
carol/dave members, gus guest; `#general`, `#random`, `#partners`, private `#exec`).
Use `settle()` or `app.hub.idle()` to let async delivery finish.
