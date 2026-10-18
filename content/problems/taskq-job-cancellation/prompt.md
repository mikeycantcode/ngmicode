# Job cancellation API

## Context

Product wants a "Cancel" button on the jobs dashboard. Concrete cases: a user
unsubscribes, so their pending emails must not go out; a report export is
cancelled halfway through, so it must stop and not retry. Today the only tool
is `queue.remove()`. It refuses active jobs, and it deletes the record, which
loses the audit trail.

## The ask

Add `queue.cancel(jobId: string, reason?: string): Promise<boolean>`.

- A cancelled job ends in a new terminal state, **`"cancelled"`**. The record
  is kept, and `getCounts()` reports a `cancelled` count.
- `reason` defaults to `"cancelled"`.
- The call resolves `true` if this call cancelled the job, and `false` if the
  job had already finished (completed, failed or cancelled). It rejects with
  `JobNotFoundError` for unknown ids.
- A new lifecycle event,
  `cancelled: { queue, jobId, prevState, reason }`, fires once per cancelled
  job.

What cancellation means in each state:

| state | behaviour |
|---|---|
| waiting / delayed | never runs |
| delayed because it's **waiting out a retry backoff** | no further tries |
| blocked (has unfinished parents) | never runs |
| **active** | the handler's `ctx.signal` is aborted right away. Whatever the handler does afterwards (returns, throws, times out) is ignored: no `completed`, no `failed`, no retry, no dead-letter entry. |

**Cascading.** When a job is cancelled, any dependents still `blocked` on it
are also cancelled, with reason `parent <id> cancelled`. This applies
transitively.

## Acceptance criteria

- The behaviour in the table holds with the scheduler and workers running.
- Handlers that cooperate with `ctx.signal` (for example `ctx.sleep`) stop
  promptly.
- Nothing else changes, and the visible test suite passes. Add tests for
  each row of the table.

## Out of scope

- UI and HTTP endpoints.
- Cancelling across processes. All workers share this `TaskQ` instance.
