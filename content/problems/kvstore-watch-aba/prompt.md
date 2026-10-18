# Optimistic locks that don't lock

The billing service uses the textbook optimistic-locking pattern:

```
WATCH wallet:42
GET wallet:42            -> compute new balance
MULTI
SET wallet:42 <new>
EXEC                     -> nil means "someone else changed it, retry"
```

Two incidents in the last week look like lost updates. In both, `EXEC`
committed when it should have returned nil.

**Incident 1.** A reconciliation job "resets" wallets by deleting the key and
writing it back with the recomputed balance. Billing workers that were
mid-transaction on that wallet committed on top of the reset.

**Incident 2.** Billing holds a short-lived `lease:<wallet>` key (set with
`PX`) and WATCHes it together with the wallet. In one trace, the lease expired
between `WATCH` and `EXEC`, nobody touched it afterwards, and the `EXEC` still
committed.

Both incidents happened after a recent "memory cleanup" change to the engine.

## Your task

1. Reproduce each incident as a failing test.
2. Find the root cause or causes and fix them.
3. Explain to your interviewer *why* the bug happens, in terms of what WATCH
   compares at EXEC time.

## Acceptance criteria

- EXEC returns nil if *any* watched key was modified between `WATCH` and
  `EXEC`, by any client. "Modified" includes being written, deleted, expired
  (even if nothing has touched the expired key since), evicted or flushed. It
  covers DEL followed by re-creation, even when the value comes back identical.
- EXEC must **not** abort when the watched keys were untouched. That includes
  keys that did not exist at WATCH time and still don't.
- Don't reintroduce unbounded memory growth without saying so. If your fix
  keeps per-key state for deleted keys, call out the trade-off.
