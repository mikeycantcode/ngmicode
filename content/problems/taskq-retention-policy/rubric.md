## Intended approach

1. Add both options to `JobOptions` **and** `NormalizedJobOptions`, and carry them through
   `normalizeJobOptions`. A vague spec lets the agent add them to the input type and forget the normalized
   output, so `job.opts.removeOnComplete` is always undefined.
2. Validate the merged values with the exact message.
3. Add a small retention helper (e.g. `src/queue/retention.ts`, `applyRetention(ctx, job, policy)`)
   and call it at the end of `JobLifecycle.complete` and `failForGood` only. Do not call it on the
   retry branches.
4. N-trim: `listByState(queue, state)`, sort by `finishedAt` desc then `seq` desc, slice off the
   first N, and remove the rest oldest-first. Skip protected jobs (`dlq.has` or any dependent
   `blocked`).

## Key files

- `src/core/types.ts`, `src/core/job.ts`
- `src/worker/lifecycle.ts` (complete / failForGood / the two retry branches)
- `src/queue/dead-letter.ts` (`has`), `src/queue/dependencies.ts` (why blocked dependents matter:
  `tryUnblock` requires every parent to exist and be `completed`)

## Traps

- **The explicit `false` override.** `{...defaults, ...opts}` handles it, but `opts.x || defaults.x`
  or `??` on a boolean expression breaks it. Hidden test 2 checks this.
- **Tie-break.** With FakeClock, every job finishes at the same instant. Sorting only by
  `finishedAt` (a stable sort in insertion order) keeps the *oldest* ones. Hidden test 1 checks
  this.
- **`true` vs N semantics.** `true`/`0` removes only this job, not "trim to 0". Hidden test 2: job
  B (`false`) must survive C's `true`.
- **Running on retries.** Hidden test 3 checks the record still exists between tries.
- **DLQ protection.** Hidden test 3.
- **Blocked-dependent protection.** Removing a parent strands its child forever in `blocked`.
  Hidden test 4. This is the trap the brief states once in a list. An agent never derives it.
- **Removal order** and the `removed` payload (`prevState`).

## Strong signals

- The candidate decomposes the work into steps (types → normalize → helper → call sites) and gives
  each its own precise instruction, including the exact sort comparator and the exact error string.
- Names the retry branches as explicitly out of scope.
- Asks the agent to show the diff of `lifecycle.ts` and checks there are exactly two call sites.
- Writes or asks for a test of the tie-break with equal timestamps.

## Weak signals

- Pastes the whole spec and says "implement this", then accepts the result without reading the
  call sites.
- Lets the agent modify `admin.clean` or the scheduler.
- Doesn't notice `NormalizedJobOptions` is missing the fields.

## Follow-up questions

- The N-trim lists all completed jobs on every completion, which is O(n) per job. How would you
  make it O(log n) or amortised O(1)?
- A protected parent is never revisited after its child unblocks. How would you eventually collect
  it?
- With a real Redis adapter, what race exists between two workers trimming the same queue?
- Should `removed` fire for retention at all, given that metrics consumers may double-count?
