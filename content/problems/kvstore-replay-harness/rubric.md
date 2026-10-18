## Intended approach
1. Build the helper first, against the public API: `new Store({ clock: new ManualClock(start) })`,
   run the commands, `clock.advance`, `Store.restore({ clock }, { wal: entries.slice(...) })`,
   then diff the two `store.dump()` results (type, value, expiresAt). Show `±Infinity` zset
   scores explicitly, because `JSON.stringify` turns them into `null`.
2. Write a table-driven sweep, one scenario per command family, with replay *later*
   (`advanceMs` > 0). Replaying at the same instant hides every relative-time bug.
3. The sweep finds two propagation bugs:
   - `EXPIRE` / `PEXPIRE` (`commands/keys.ts`, `expireGeneric`) only rewrite the absolute forms
     to `PEXPIREAT`. Relative forms are logged verbatim and restart the countdown on replay.
     The comment justifying this is wrong.
   - `SET ... PX` (`commands/strings.ts`, `parseSetFlags`) sets `relative = opt === "EX"`, so
     PX is logged verbatim. EX works, which is why spot checks pass.
   Fix: always `ctx.rewrite(["PEXPIREAT", key, at])` in `expireGeneric`. Set `relative = true`
   for both EX and PX.
4. Note that the visible tests were weakened in the same change: they now use `EX`, `EXPIREAT`
   and `PEXPIREAT` only. A strong candidate notices that and restores coverage.

## Key files
- `src/store.ts` (`restore`, `dump`), `src/util/clock.ts` (`ManualClock`)
- `src/commands/keys.ts` (`expireGeneric`), `src/commands/strings.ts` (`parseSetFlags`)
- `src/server/dispatcher.ts` + `CommandContext.rewrite`: how propagation works
- README "Persistence model"

## Traps
- **Replaying at the same time.** Without `advanceMs`, both bugs are invisible. The helper's
  whole point is the time shift.
- **Diffing only values, not `expiresAt`.** The incident is about TTLs.
- **Fixing in the wrong layer.** For example, making `replay` "re-relativize" TTLs, or changing
  `Store.restore` to recompute deadlines. The bug is in propagation.
- **Fixing EXPIRE but not PX.** Hidden test 2.
- The weak agent may write a helper that compares `wal.entries` strings instead of resulting
  state, or that reuses one store for both sides.

## Strong signals
- The candidate defines the helper's contract precisely for the agent before any sweep.
- The candidate asks for a table-driven sweep that enumerates every TTL-setting path (EX, PX,
  EXAT, PXAT, KEEPTTL, EXPIRE, PEXPIRE, EXPIREAT, PEXPIREAT, PERSIST, SETEX) and replays later.
- The candidate finds both bugs through the harness rather than by reading code first, and
  can explain why the existing tests missed them.
- The `dropEntries` mode is used to reason about torn logs.

## Weak signals
- Writing ad-hoc assertions per command instead of a reusable helper.
- Fixing the EXPIRE bug from code reading and stopping there.
- The helper always returns `[]` (e.g. compares a store with itself).

## Follow-up questions
- How would you turn this harness into a property-based test (random command sequences)? What would you need to make shrinking work?
- What other nondeterminism could break replay equivalence besides time? (Floats, iteration order, randomness, config.)
- The WAL logs a DEL when a key expires. Why is that needed if TTLs are absolute? Write a scenario your harness would catch without it.
- Should the harness also compare `INFO` counters? Which ones are expected to differ after a restore?
