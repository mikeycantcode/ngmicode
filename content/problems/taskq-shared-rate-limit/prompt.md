# Rate limit multiplied by worker count

## Context

Our payments provider allows **5 requests per second**. The `payments` queue
is configured with `rateLimit: { max: 5, duration: 1000 }`. Yesterday the
provider throttled us and then suspended our API key for an hour. Their logs
show bursts of about **15 requests per second**.

We run three worker instances on that queue. The rate-limit tests in this
repo are green, and nobody believes the limiter is broken.

## Your task

This is a testing exercise. Before anyone touches `src/`:

1. Add a reusable test helper to `tests/helpers.ts`:

   ```ts
   recordStarts(tq: TaskQ, queue: string): number[]
   ```

   It returns a **live** array. Each time a job on `queue` becomes active
   (one entry per try started), the helper appends the current clock time.
   Jobs on other queues are ignored.
2. Using that helper, write a regression test that **fails** and reproduces
   the production behaviour.
3. Then fix the bug the test exposes, so that the test passes along with the
   rest of the suite.

## Acceptance criteria

- `recordStarts` behaves exactly as specified. Other tests will use it.
- A queue's `rateLimit` holds across **all** workers of that queue. That
  includes workers started later, partway through a window.
- The sliding-window semantics are unchanged: at most `max` starts in any
  `duration` ms.
- Show the test failing before the fix and passing after.

## Notes

You're working with a smaller, older model with limited context. It reads
files in truncated chunks and gets only a few tool steps per turn.
