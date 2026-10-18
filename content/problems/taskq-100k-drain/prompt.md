# Drain 100k jobs before the deploy window closes

## Context

Tonight's data-migration backfill puts about **100,000 jobs** on one queue in a
single `addBulk` call, then starts a worker. In staging, the first few thousand
jobs go through quickly. After that the queue slows down until it is barely
moving. CPU sits at 100% the whole time, and handler time is near zero (the
handlers are trivial).

Nobody has changed the handlers. The storage layer was "simplified" a couple of
releases ago, and there have been small worker changes since then.

## Your task

Make draining a large queue fast again, in **wall-clock time**. A benchmark
shaped like this must finish well inside **1.5 s** on a laptop:

- 100,000 jobs added with `addBulk`, using priorities `0`, `1` and `2` mixed together.
- One worker on the queue. Test it with `concurrency: 1` and with `concurrency: 64`.
- Wait for the worker's `drained` event.

## Acceptance criteria

- Every job runs exactly once. The order is unchanged: lower priority number
  first, and FIFO within the same priority.
- `drained` still fires once the queue is empty and the worker is idle.
- Existing behaviour keeps working: delayed jobs, retries, stalled-job
  recovery, counts, pause/resume, and the visible test suite.
- Explain each hot path you found, its complexity before and after, and how you
  confirmed it was a hot path.

## Constraints

- Keep the public `Storage` interface. Other adapters implement it.
- Don't cheat the benchmark. Don't special-case big queues or skip events, and
  don't drop `drained`.
- You may add tests. Don't sleep on real time in tests; the FakeClock is
  available.
