# Duplicate webhooks after a GC pause

## Incident summary

A webhook-delivery node froze for about 40 seconds (a stop-the-world GC
pause). Locks are 30 seconds, so the scheduler's stalled-job check rightly
treated its in-flight jobs as abandoned and handed them to other workers.
Then the frozen node woke up. Since then:

1. About 40 jobs emitted `completed` **twice**. Our webhook fan-out listens to
   `completed`, so customers got duplicate webhooks.
2. Some job records show the **frozen** node's return value, not the result
   from the run that actually delivered.
3. A few jobs that had already completed were later found back in `delayed`
   and ran a **third** time.
4. One ETL flow started a child job while its parent was still running on the
   second node.

All visible tests pass.

## Your task

Make the system safe against a worker that wakes up after losing its job:

- Only the worker that currently owns a job may record its outcome
  (complete, retry or fail).
- A stale worker's result is dropped. It does not emit `completed` or
  `failed`, does not schedule retries, and does not touch dependents. It is
  visible only as a warning or `lock:lost` event.
- Behaviour for the worker that does own the job is unchanged.

Find out why this regressed, fix it, and add a regression test.

## Notes

- You're working with a smaller, older model with limited context. It reads
  files in truncated chunks and gets only a few tool steps per turn.
- Don't touch the stalled-detection timing. Detecting the stall and
  re-running the job was correct.
