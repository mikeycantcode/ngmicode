## Intended approach
Read `Keyspace.expireIfNeeded` and `ExpiryManager.cycle`. Both paths funnel through
`expireIfNeeded`, but the starter only increments `stats.expiredKeys` and emits `expired` inside
the active cycle, after `expireIfNeeded` returns true. Lazy expiry (GET, EXISTS, SET and the
others, via `lookupRead`, `lookupWrite` and `delete`) removes keys silently. The fix moves the
counting and the event into `expireIfNeeded` and **removes** them from the cycle. Adding them to
`expireIfNeeded` without removing them from the cycle double-counts active expiry.

Expected answers for Part 1:
1. Lazy expiry: every keyspace accessor calls `expireIfNeeded`, including `lookupRead`,
   `lookupWrite`, `set`, `delete`, `setExpire`, `rename`, and WATCH/EXEC. Active expiry:
   `store.tick()` calls `ExpiryManager.cycle`, which samples volatile keys round-robin
   (`sampleVolatile`) and stops once fewer than 25% of a sample were expired.
2. The `onExpired` hook makes the store append `DEL key`. Replay at a different time, or a
   compacted log, would otherwise depend on the replay-time clock. The explicit DEL makes the
   log self-contained and keeps replicas and replay identical to the primary. Partial credit for
   "so replay is deterministic".
3. DBSIZE counts it (`ks.size` includes unreaped keys, same as Redis). GET doesn't return it,
   because lazy expiry removes it first and counts a miss. SCAN and KEYS skip it, because they
   use `ks.keys()` and `peek`, which hide expired keys without deleting them.
4. It should count every key removed by TTL. Today it counts only keys removed by the active cycle.

## Key files
- `src/core/keyspace.ts`: `expireIfNeeded`, whose comment is misleading in the starter.
- `src/core/expiry.ts`: the active cycle, which holds the counting in the starter.
- `src/store.ts`: the `onExpired` hook that logs DEL; `info()`.

## Traps
- **Double counting.** The obvious fix is to add `stats.expiredKeys++` and `emit` to
  `expireIfNeeded`. Because the active cycle *also* calls `expireIfNeeded`, active expiry then
  counts twice. Hidden test 2 expects exactly 3, not 6.
- The comment in the starter says the counting lives in the cycle "for perf". That claim is false
  (a counter increment is free), and a candidate shouldn't take it at face value.
- Counting in `lookupRead` only misses lazy expiry triggered by writes, EXISTS, TTL and others.
  Hidden test 3 uses EXISTS.

## Strong signals
- The candidate asks the agent to trace both call paths *before* editing, and asks it to list
  every caller of `expireIfNeeded`.
- Part 1 answers are precise and cite functions. They distinguish logically expired from
  physically removed.
- The candidate writes or runs a test for lazy, active and mixed expiry and checks the exact counts.
- The candidate notices the misleading comment and fixes or removes it.

## Weak signals
- The candidate patches the counter in a single command handler (e.g. GET).
- Part 1 answers are vague, such as "keys expire after their TTL".
- The fix is accepted without checking the active path's count.

## Follow-up questions
- Why does Redis use both lazy and active expiry instead of a timer per key?
- The active cycle stops when fewer than 25% of a sample are expired. What workload makes that heuristic leave a lot of garbage behind?
- If replicas applied TTLs independently instead of receiving DELs, what inconsistency could a client observe?
- Should an expired key that is overwritten by `SET` count as expired? What does this code do, and what does Redis do?
