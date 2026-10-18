## Intended approach
`grep -rn "nowMs\|Date.now\|new Date" src` finds every site.
- `commands/strings.ts`: `SETEX`/`PSETEX` (`setexLike`) compute `nowMs() + ms`. Switch to
  `ctx.clock.now()`. There is no FIXME here, so a candidate who only follows FIXMEs misses it.
- `core/stats.ts`: `startedAt = nowMs()` and `uptimeMs()`. Inject the clock through the constructor.
- `store.ts`: `snapshot()` uses `nowMs()` (FIXME). Switch to `this.clock.now()`.
- `util/time.ts`: remove `nowMs`. Keep `secondsToMs` and `msToRoundedSeconds`, which `keys.ts` uses.

**Construction-order trap:** `Store` declares `readonly stats = new Stats()` as a class field
initializer. Field initializers run before the constructor body assigns `this.clock`, so
`new Stats(this.clock)` in the initializer receives `undefined`. Stats must be constructed in the
constructor after the clock is set, or receive `opts.clock` directly.

## Key files
- `src/util/time.ts`, `src/util/clock.ts`
- `src/commands/strings.ts` (SETEX/PSETEX)
- `src/core/stats.ts`, `src/store.ts`
- `src/core/keyspace.ts`: already correct; a good reference for how the clock is threaded through.

## Traps
- Missing SETEX/PSETEX because they look like legacy dead code. Hidden test 1.
- `new Stats(this.clock)` in the field initializer. The result is `this.clock` undefined →
  crash, or `NaN` uptime. Hidden test 2.
- Leaving `snapshot()` alone because it "only affects metadata". Hidden test 3.
- Over-reaching: changing the `Clock` interface, or making `Stats` a singleton.

## Strong signals
- The candidate starts with a repo-wide search and gives the agent the full list of sites.
- The candidate notices the field-initializer ordering issue, or catches it when the agent's change crashes.
- The candidate adds tests under `ManualClock` for each site before or alongside the change.
- The candidate runs the full visible suite to confirm no behavior change.
- The change is small, mechanical and reviewable.

## Weak signals
- Fixing only the FIXME-marked sites.
- Keeping `nowMs` "for compatibility" without justification.
- No tests that use `ManualClock` for the migrated paths.

## Follow-up questions
- How would you prevent a regression (lint rule, test, CI grep)?
- `SystemClock.setTimer` uses `setTimeout`. What else in a simulation harness needs to be virtualized besides `now()`?
- Is it correct for `uptime_ms` to follow a clock that can be set arbitrarily? Is there an argument for a separate monotonic clock?
- Replaying a WAL under a `ManualClock` that starts earlier than the original run: what happens to keys with `PXAT` in the "future"?
