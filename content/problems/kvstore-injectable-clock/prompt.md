# Finish the Clock migration

We're adopting deterministic simulation testing. We'll run the engine under a
`ManualClock` for millions of simulated hours and compare results
byte-for-byte across runs. That only works if **nothing** in the engine reads
the wall clock.

The `Clock` abstraction (`src/util/clock.ts`) was introduced a while ago and
most code uses it, but the migration was never finished. The old helper
module is still around and marked deprecated.

## The ask

Refactor the engine so that all time-dependent behavior comes from the
store's injected `Clock`:

- No production code under `src/` may call `Date.now()` or `new Date()`, except
  `SystemClock` itself.
- Delete the deprecated "current time" helper. Pure unit-conversion helpers may stay.
- Behavior with the default `SystemClock` must be unchanged. All existing tests
  must keep passing.

## Acceptance criteria (run under `ManualClock`)

- Every way of setting a TTL produces deadlines relative to the injected clock,
  including legacy commands that older clients still send.
- `INFO uptime_ms` (and `store.info().uptime_ms`) is the elapsed time on the
  injected clock since the store was created.
- Snapshots record `createdAt` from the injected clock.
- WAL contents are unaffected apart from the timestamps now being correct.

## Non-goals

Don't add new features, and don't change the `Clock` interface unless you
must. Explain any changes you do make.
