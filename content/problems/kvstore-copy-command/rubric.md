## Intended approach
Orient first: README → `commands/registry.ts` → `commands/keys.ts` (RENAME is the closest
sibling) → `core/keyspace.ts` → `server/dispatcher.ts`. Add a `CommandSpec`
`{ name: "COPY", arity: -3, flags: ["write", "denyoom"], keys: firstTwo }`. The handler:
1. Parses `REPLACE`, rejects other arguments, and rejects `src === dst`.
2. Reads the source through `ctx.ks.lookupRead`/`lookupWrite`, which applies lazy expiry, so an
   expired source counts as missing.
3. Checks the destination through `lookupWrite`, which also lazily expires it.
4. Deep-clones the value. The neat reuse is `decodeValue(type, encodeValue(value))` from
   `persistence/snapshot.ts`; a hand-written clone works too.
5. Calls `ctx.ks.set(dst, clone, { expiresAt: ctx.ks.getExpire(src) })`. That one call
   handles memory accounting, LRU, the WATCH version bump, the TTL index and the dirty counter
   (and so WAL logging).

Logging the original argv is replay-safe here. The source's TTL is already absolute in the log,
so COPY at replay time copies the same deadline. A candidate who rewrites the propagation to
explicit `SET`/`RPUSH` + `PEXPIREAT` is also correct, and arguably more robust.

## Key files
- `src/commands/keys.ts` (RENAME), `src/commands/registry.ts`
- `src/core/keyspace.ts`: `set` options, `getExpire`, `lookupRead`
- `src/server/dispatcher.ts`: `write` → WAL, `denyoom` → eviction
- `src/persistence/snapshot.ts`: `encodeValue`/`decodeValue`, `rewriteCommands` (compaction already handles the result)

## Traps
- **Shallow copy / aliasing.** `ctx.ks.set(dst, value)` or `{ ...value }` shares the `string[]`,
  `Map` or `SortedSet`. LPUSH on the source then changes the destination. Hidden test 1.
- **TTL.** The copy must carry the source's absolute deadline. With REPLACE, the destination's
  old TTL must be cleared (`expiresAt: null`, not `keepTtl`). Hidden test 2.
- **Expired source.** Reading with `peek` and then writing works, but direct map access would
  copy a dead key. Hidden test 2 checks that an expired source returns 0 and doesn't create the
  destination.
- **Missing flags.** Without `write`, COPY is never logged and disappears on restart. Without
  `denyoom`, it bypasses maxmemory. Hidden test 3 checks replay and WATCH.
- Building the destination by writing to internal maps (`data`/`versions`) skips memory
  accounting. Hidden test 4 checks `used_memory`.

## Strong signals
- The candidate has the agent summarize the keyspace mutation rules (README "Conventions")
  before writing code.
- The candidate explicitly asks for a deep copy and names the aliasing risk.
- The candidate verifies durability with a restore test that advances the clock.
- The candidate checks the `write`/`denyoom` flags and explains what each does.
- The candidate reuses existing primitives instead of hand-rolling accounting.

## Weak signals
- Only the happy-path string copy is tested.
- The agent's implementation is accepted without a restart (replay) test.
- The candidate edits `Keyspace` internals to add a `copy` method that bypasses `set`.

## Follow-up questions
- Is logging `COPY src dst` safe to replay at any time? Construct a log where it would not be, and say how you'd guard against it.
- COPY of a 1M-element list is O(n) and blocks the single thread. How would you make it cheaper (copy-on-write sharing)? What would that do to memory accounting?
- What should `COPY` emit to keyspace notifications, if they existed?
- How does your implementation interact with `maxmemory` when the copy alone exceeds the budget?
