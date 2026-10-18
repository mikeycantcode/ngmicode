## Intended approach

Group exclusivity must be enforced at the point where jobs become claimable, which is **storage**.
The worker is the wrong place, because there are several workers and each has its own memory.

The reference solution changes `MemoryStorage`, plus option types and validation:

- A per-(queue, group) `GroupState { owner?, pending[] }`. `pushWaiting` puts a grouped job into
  the waiting heap only if it is (or becomes) the group's owner. Otherwise it is appended to
  `pending` in add order (seq).
- The owner keeps the group while it moves through active → delayed (backoff) → waiting → active,
  because each `pushWaiting` of the owner goes straight to the heap.
- When the owner reaches `completed` or `failed` (centrally, in `apply()` on a state change, and
  in `remove()`), the group is released and the next pending job that is still `waiting` is pushed
  to the heap.
- Validation in `normalizeJobOptions`: `group` + `delay > 0` or non-empty `dependsOn` →
  `InvalidJobOptionsError`.

## Key files

- `src/storage/memory-storage.ts` (`pushWaiting`, `claim`, `apply`, `finish`)
- `src/core/types.ts`, `src/core/job.ts`
- `src/worker/worker.ts` (tempting but wrong place), `src/worker/lifecycle.ts` (retry path),
  `src/scheduler/scheduler.ts` (promotion and stall recovery call `pushWaiting`)

## Traps

- **Per-worker "busy groups" set.** It works with one worker and fails with two. Hidden test 1 uses
  two workers.
- **"Skip if the group has an active job" at claim time.** During a retry backoff the owner is
  `delayed`, not `active`, so the next job sneaks in. Hidden test 2. This is the trap the brief
  states once ("or waiting out a retry backoff").
- **Ordering by priority within a group.** If grouped jobs stay in the priority heap, `a3`
  (priority −3) overtakes `a2`. Hidden test 1.
- **Busy-looping or starving.** Skipping the head entry and re-pushing it on every claim can spin
  or reorder other jobs. A heap pop-and-skip without re-insertion loses the job.
- **Not releasing on terminal failure, or on removal.** The group deadlocks forever. Hidden test 3.
- **Release only in `lifecycle.complete`.** That misses stall-failure (scheduler) and dependency
  cascade paths. Centralising the release in storage state changes covers them all.

## Strong signals

- Identifies storage/claim as the only place that sees all workers, and says so before coding.
- Enumerates every path a grouped job can take (claim, retry delay, retry immediate, stall back to
  waiting, stall failure, DLQ replay, remove) and checks each one.
- Writes a multi-worker test with gated handlers that records the per-group in-flight peak.
- Discusses head-of-line blocking: one failing customer with long backoff stalls only their own
  group.

## Weak signals

- Implements in the worker with a `Set<string>`.
- Tests only with `concurrency: 1`, where groups are trivially satisfied.
- Lets priority reorder grouped jobs, or doesn't mention it.

## Follow-up questions

- How would you implement groups on Redis atomically across processes (per-group lists +
  active-group set + Lua)?
- A poison message in a group with `attempts: 10` and exponential backoff blocks that customer for
  hours. What policy would you offer?
- How does this interact with rate limiting? Can a single group starve under a tight limit?
- What's the memory cost of `pending` for a hot group with 1M jobs, and how would you bound it?
