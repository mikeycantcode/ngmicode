# kvstore

An embeddable, Redis-flavored key-value database written in dependency-free
TypeScript. Hosts embed it in-process, talk to it with Redis-style text
commands, and persist its write-ahead log however they like.

```ts
import { Store, ManualClock } from "./src";

const store = new Store({ clock: new ManualClock(), config: { maxmemory: 1 << 20, "maxmemory-policy": "allkeys-lru" } });
const s = store.connect();
s.exec(`SET greeting "hello world" EX 60`);   // "OK"
s.exec("HSET user:1 name ada lang ts");        // 2
store.tick();                                  // active expiry — call periodically
const log = [...store.wal.entries];            // persist these
const copy = Store.restore({}, { wal: log });  // rebuild later
```

## Architecture

```
 host ──► Session.exec("SET k v EX 10")
            │ tokenize (protocol/tokenizer)
            ▼
         Dispatcher.dispatch ──► arity / MULTI queueing
            │
            ▼
         Dispatcher.execute ──► Evictor.ensureBudget()   (denyoom commands)
            │                   CommandSpec.handler(ctx, args)
            │                   WAL append (write commands that changed something)
            │                   events.emit("command")
            ▼
         Keyspace  (core/keyspace.ts)
           data  : key → Entry { value, expiresAt, size }
           volatile : TTL index (active expiry round robin)
           lru   : recency order for eviction
           versions : per-key modification stamps for WATCH
```

| Layer | Path | Notes |
|-------|------|-------|
| Entry point | `src/store.ts` | Wires everything; `connect()`, `exec()`, `tick()`, `info()`, `snapshot()`, `replay()`, `restore()`, `dump()` |
| Sessions | `src/server/session.ts` | Per-client state: MULTI queue, WATCHed keys, pub/sub inbox |
| Dispatch | `src/server/dispatcher.ts` | Lookup, arity, queueing, eviction, WAL propagation |
| Commands | `src/commands/*.ts` | One module per data type; each exports `CommandSpec[]`, collected in `registry.ts` |
| Keyspace | `src/core/keyspace.ts` | The only code that touches the key map |
| Expiry | `src/core/expiry.ts` | Active expiry cycle (lazy expiry lives in the keyspace) |
| Eviction | `src/core/eviction.ts` | `noeviction`, `allkeys-lru`, `volatile-lru` |
| Memory | `src/core/sizeof.ts` | Approximate per-entry sizes for `maxmemory` |
| Persistence | `src/persistence/*` | WAL codec, WAL, replay, snapshots, compaction |
| Pub/Sub | `src/pubsub/*` | Channels and patterns; delivery to session inboxes |
| SCAN | `src/scan/cursor.ts` | Cursor-based iteration with MATCH / COUNT / TYPE |

## Conventions

- **Replies** are plain JS values: `string` (bulk/status), `number` (integer),
  `null` (nil), arrays, and `ErrorReply` for errors. Handlers *throw*
  `KvError` (`src/errors.ts`) and the dispatcher converts it; the message is
  exactly what clients see (`"ERR ..."`, `"WRONGTYPE ..."`).
- **Never touch the key map directly.** Read with `ks.readAs` /
  `ks.lookupRead` (applies lazy expiry, LRU and hit/miss stats) or
  `ks.writeAs` / `ks.lookupWrite`; mutate with `ks.set`, `ks.delete`,
  `ks.setExpire`, `ks.rename`. After mutating an aggregate in place call
  `ks.mutated(key)` — it re-measures memory, deletes empty aggregates and bumps
  the WATCH version.
- **Time** comes from the injected `Clock` (`ctx.clock`, `store.clock`). Tests
  use `ManualClock`. TTLs are stored as absolute milliseconds.
- **Command flags** drive behavior: `write` commands are WAL-logged when they
  changed the keyspace; `denyoom` commands trigger eviction first; `readonly`
  commands are never logged.
- **Numbers**: integers are stored as strings; parse with `parseInteger` /
  `parseFloatStrict`, format doubles with `formatDouble` (`src/util/numbers.ts`).

## Persistence model

The WAL (`store.wal.entries`) is an append-only array of RESP-like encoded
commands. Invariant: **replaying the WAL into an empty store at any later time
reproduces the same keyspace.** Therefore:

- Commands log their *propagated* form via `ctx.rewrite(...)` when the original
  argv is not deterministic: relative TTLs become `PXAT` / `PEXPIREAT`,
  `INCRBYFLOAT` becomes `SET ... KEEPTTL`, `ZINCRBY` becomes `ZADD`.
- Keys removed by expiry or eviction are logged as explicit `DEL`s.
- The writes of one `EXEC` are wrapped in `MULTI` / `EXEC`.
- Replay (`persistence/replay.ts`) runs on an internal session with
  `replaying = true`: no WAL appends, no eviction, and expiry is frozen
  (`Keyspace.loading`) because the log carries explicit DELs.

Snapshots (`SAVE`, `store.snapshot()`) are a checksummed JSON document.
`BGREWRITEAOF` compacts the WAL to one command per key (+ `PEXPIREAT`).

## Expiry

Two mechanisms, both ending in `Keyspace.expireIfNeeded`:

1. **Lazy** — every keyspace lookup checks the TTL first.
2. **Active** — `store.tick()` samples volatile keys round-robin and reaps the
   expired ones (`core/expiry.ts`).

`DBSIZE` / `info().keys` count expired keys that have not been reaped yet
(same as Redis).

## Transactions

`MULTI` / `EXEC` / `DISCARD` / `WATCH` / `UNWATCH`, Redis semantics. A watched
key counts as modified if it was written, deleted, expired, evicted or flushed
after `WATCH`. Versions come from one global sequence, so `DEL` + `SET` never
looks like "unchanged".

## Known gaps / roadmap

- Glob patterns support `*` and `?` only (no `[...]` classes or escapes).
- No blocking commands (`BLPOP` etc.); `Session.send()` is already async to make room for them.
- No keyspace notifications.
- No `COPY`, no `ZRANGEBYSCORE`, no `GETRANGE`.
- `util/time.ts` is deprecated; a few older call sites still use it.

## Running tests

Tests use the in-house `testkit` (jest-like) and live in `tests/`.
