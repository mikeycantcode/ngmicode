## Intended approach

1. Write the helper: subscribe to `tq.events.on("active", …)`, filter on `p.queue`, push
   `tq.clock.now()`, and return the array.
2. Write a test with **two or more workers** on a rate-limited queue, add more jobs than `max`, and
   assert the number of starts in the first window. It fails: each worker allows `max`.
3. Root cause (overlay): the limiter moved from `Queue` into `Worker`
   (`this.limiter = new RateLimiter(...)` in the worker constructor), so every worker has its own
   window. The comment in `rate-limiter.ts` and the README still say "one limiter per queue,
   shared by every worker". Fix: construct the limiter once per `Queue` (as before) and have
   workers use `queue.limiter`.

## Key files

- `tests/helpers.ts` (add `recordStarts`)
- `src/worker/worker.ts` (overlay: per-worker limiter)
- `src/queue/queue.ts` (overlay: limiter removed)
- `src/queue/rate-limiter.ts` (doc comment states the intended design)

## Traps

- **Testing with one worker.** The existing visible test does this and passes. Candidates who let
  the agent "add a rate limit test" get another green single-worker test. The candidate must steer
  the agent toward the multi-worker scenario from the incident.
- **Dividing the limit by worker count** (`max / workers`). That breaks for workers added later
  and for uneven counts. Hidden test 2 adds a worker mid-window.
- **A module-level global limiter** keyed by nothing. That leaks across TaskQ instances and tests.
  It should be keyed per queue, owned by the queue.
- **The helper using `Date.now()`** instead of `tq.clock.now()`, or not filtering by queue. Hidden
  test 1 checks this.
- **Recording on `completed`** instead of `active`. The brief says "becomes active".

## Strong signals

- The candidate insists on a red test first and states why the existing test missed the bug (a
  single worker).
- Feeds the model the incident's specifics (3 workers, 15/s) as the test scenario.
- Asks the model to show the failing output before allowing edits under `src/`.
- Notices the outdated or contradictory comment as evidence of a regression.

## Weak signals

- Fixes `src/` first, then writes a test that passes.
- Accepts a helper that returns a snapshot (not live) or ignores the queue argument.
- Has no explanation for why the existing suite was green.

## Follow-up questions

- How would you enforce this limit across *processes*, e.g. a Redis sliding-window log vs a token
  bucket?
- Your test uses FakeClock. What could still make it flaky?
- Should retries count against the rate limit? What does `recordStarts` count?
- What other per-queue state might have the same "per-worker copy" bug (pause, concurrency)?
