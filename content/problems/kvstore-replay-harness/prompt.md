# Build a replay-equivalence harness

**Incident:** after a routine restart, rate-limit keys that should have expired
minutes earlier were still blocking customers. Restart means rebuilding the
store from its WAL (`Store.restore({ clock }, { wal })`). Nobody knows which
commands are affected. The existing tests are green.

The engine's core promise (see the README) is that replaying the WAL into an
empty store, at any later time, reproduces the same keyspace. We clearly
don't test that promise well enough. Your job is to test it properly, and to
fix whatever the tests find.

You're pairing with a weaker agent. Keep its tasks small and concrete.

## Deliverables

### 1. A reusable test helper: `tests/helpers/replay-harness.ts`

It must export:

```ts
export interface ReplayDiffOptions {
  startMs?: number;    // ManualClock start for the original store (default 1000)
  advanceMs?: number;  // time between the last command and the restore (default 0)
  dropEntries?: number; // simulate a torn log: drop this many WAL entries from the end (default 0)
}

/** Runs `commands` on a fresh store, advances the clock, restores a second
 *  store from the (possibly truncated) WAL, and compares the two keyspaces.
 *  Returns one human-readable line per differing key, each line starting
 *  with the key name, sorted by key. Returns [] when equivalent. */
export function replayDiff(commands: string[], opts?: ReplayDiffOptions): string[];

/** Throws an Error whose message includes the diff, if replayDiff is non-empty. */
export function assertReplayEquivalent(commands: string[], opts?: ReplayDiffOptions): void;
```

"Same keyspace" means the same keys, types, values *and* expiry deadlines.

### 2. A test suite that uses it

Sweep the engine's write commands, including every way to set or change a
TTL, and replay *later in time*. The suite should make it obvious which
commands are covered.

### 3. Fixes

Fix the bugs your suite finds, with a short explanation of each root cause.
Keep the fixes minimal and in the right layer.
