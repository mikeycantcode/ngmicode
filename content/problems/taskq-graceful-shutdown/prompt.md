# Graceful shutdown for deploys

## Context

Every deploy kills our worker pods. The pod gets SIGTERM, calls
`await tq.close()`, and the platform force-kills it 30 seconds later. Today
`close()` returns immediately. Jobs that were mid-flight sit in `active`
until the stalled-job check notices them about 30 seconds later, and each one
**burns an attempt**. Billing jobs with `attempts: 2` have been landing in the
dead-letter queue after two deploys in a row. Meanwhile, the API pods share
the same `TaskQ` instance and keep enqueuing during shutdown.

## The ask

Make `tq.close(opts?: { timeoutMs?: number })` a real graceful shutdown.
`timeoutMs` defaults to `30_000`.

1. Stop background housekeeping right away: no delayed promotion, no
   repeatable enqueues and no stall checks after `close()` is called.
2. Reject new work. `queue.add` (and anything built on it) rejects with the
   existing `QueueClosedError`.
3. Workers stop starting jobs. Jobs already running are allowed to finish,
   and their outcomes are recorded as usual: completion, retry scheduling
   and dead-lettering all still happen.
4. **Deadline.** Measured on the injected clock. If jobs are still running
   when `timeoutMs` elapses, abort each one's `ctx.signal` and put it back in
   `waiting`. The interrupted try **must not count as an attempt**. Whatever
   those handlers do afterwards is ignored.
5. `close()` resolves once every worker is done (finished, or aborted and
   handed back). It then emits a new event, `closed: { at }`, exactly once.
6. Calling `close()` again, or concurrently, never starts a second shutdown.

## Acceptance criteria

- All six points hold with real workers and the scheduler running.
- Behaviour while not shutting down is unchanged, and the visible suite
  passes. Add tests that drive time with `FakeClock`.

## Out of scope

- Process signal handling (SIGTERM wiring).
- Re-opening a closed `TaskQ`.
