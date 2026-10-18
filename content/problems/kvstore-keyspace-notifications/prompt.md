# Keyspace notifications

The cache-invalidation service wants to *subscribe* to changes instead of
polling. Implement Redis-style keyspace notifications on top of the existing
pub/sub system.

## Configuration

`CONFIG SET notify-keyspace-events <flags>`, also settable through
`new Store({ config: { "notify-keyspace-events": "KE" } })`:

- `K` enables keyspace channels and `E` enables keyevent channels. Both may be
  given, in either order. `""` disables notifications, and that is the default.
- Any other character returns
  `ERR Invalid argument '<value>' for CONFIG SET 'notify-keyspace-events'`.
- `CONFIG GET notify-keyspace-events` returns the canonical form: `K` before `E`.

## Messages

For each event on a key, publish through the normal pub/sub broker:

| Flag | Channel | Payload |
|---|---|---|
| `K` | `__keyspace@0__:<key>` | `<event>` |
| `E` | `__keyevent@0__:<event>` | `<key>` |

When both flags are on, the `K` message is published before the `E` message.

## Which events

- **Commands.** The event name is the command name in lowercase (`set`,
  `del`, `lpush`, `hincrby`, `expire`, `rename`, ...). There is one event per key
  the command **actually changed**, published after the command finishes, in
  the order the keys were changed. Examples:
  - `MSET a 1 b 2` gives `mset` for `a`, then `mset` for `b`.
  - `DEL a missing` gives one `del`, for `a` only.
  - `SET k v NX` on an existing key, `HDEL h nosuchfield`, or `LPOP` on a missing list: nothing.
  - `RENAME a b` gives `rename` for `a` and `rename` for `b`.
  - `FLUSHALL` publishes no per-key events.
- **Expiry.** A key removed because its TTL elapsed gives `expired`, whether
  it was removed lazily or by `store.tick()`.
- **Eviction.** A key removed by the maxmemory policy gives `evicted`.
- **Transactions.** Nothing is published when a command is queued. Events are
  published as `EXEC` runs each queued command.
- **Restore.** Rebuilding a store from a WAL or a snapshot must not publish
  anything, even if subscribers are already connected.

Notifications are not commands. They are never written to the WAL and do not
count as keyspace hits or misses.
