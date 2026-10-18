# Ordered job groups (per-customer FIFO)

## Context

The CRM-sync service pushes customer changes to a partner API, one job per
change. If two changes for the same customer are applied out of order, or at
the same moment, the partner keeps the older state. We run 4 workers with
`concurrency: 8` each, so changes for the same customer regularly run in
parallel. Overall throughput still matters: thousands of customers change
every minute.

We want SQS-FIFO-style **message groups**.

## The ask

Add a job option `group?: string`.

- Jobs with the same `group` on the same queue run **one at a time**, in the
  order they were **added**. Within a group, `priority` is ignored.
- Jobs in different groups, and jobs with no group, run in parallel as they
  do today. Priority still decides which runnable job goes first.
- A group stays held while its current job is running **or waiting out a
  retry backoff** between tries. It is released only when that job completes
  or fails for good. The next job in the group then becomes runnable.
- Combining `group` with `delay` or `dependsOn` is rejected with
  `InvalidJobOptionsError`.
- Correctness must hold for any number of workers and any concurrency on the
  queue, and across stalled-job recovery.

## Acceptance criteria

- The rules above, with no regressions. The visible suite passes.
- Tests that show ordering with several workers and with retry backoff.
- Be ready to discuss throughput: what does one slow customer cost everyone
  else?

## Out of scope

- Groups that span several queues.
- Changing the public `Storage` interface signatures. You may change the
  adapter's internals.
