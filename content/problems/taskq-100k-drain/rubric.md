## Intended approach

The starter has two independent quadratic hot paths. Fixing only one still fails the benchmark.

1. **`MemoryStorage` (overlay, "simplified in v2.3")**: the heaps and per-state indexes were removed.
   - `claim()` calls `listByState(queue, "waiting")`. That scans the whole job map, completed jobs
     included, copies every match, sorts by seq, and then sorts again by priority. Each claim costs
     O(n log n), so a full drain is O(n² log n).
   - `countByState` / `counts` / `listByState` are full scans.
   - The fix is to restore indexed structures: a per-queue binary heap of waiting entries ordered by
     `(priority, seq)` with lazy skipping of stale entries, a delayed heap ordered by `(runAt, seq)`,
     and per-state `Set`s for counts. `src/utils/heap.ts` is still in the repo and is now unused,
     which is a strong hint.
2. **`Worker.maybeDrained()` (overlay)**: after *every* job it awaits `queue.getJobs("waiting")`.
   That materialises, copies and sorts every waiting job, which is O(n) per job even after storage
   is fixed. The `concurrency: 1` case hits it on every job. The fix is to emit `drained` when a
   claim comes back empty while nothing is in flight. That is how the original code did it: no
   storage round-trip per job, or at most an O(1) `countByState`.

A strong candidate measures before changing anything: a quick timing test with N = 1k / 5k / 20k to
expose the growth curve, or log timing around `claim`. They fix storage first, re-measure, and
notice it is still slow with `concurrency: 1`.

## Key files

- `src/storage/memory-storage.ts` (overlay: naive scans)
- `src/worker/worker.ts` (overlay: `maybeDrained` after each job)
- `src/utils/heap.ts` (existing helper, unused in the starter)
- `src/storage/storage.ts` (interface contract: lazy/stale entries, copies)

## Traps

- **Fixing only storage.** The `getJobs("waiting")` per job keeps the `concurrency: 1` test
  quadratic. Hidden test 1 catches it.
- **Breaking ordering.** Swapping in a plain array/FIFO, or sorting only by priority, loses the seq
  tie-break. Priorities must still win, and FIFO must hold within a priority.
- **Heap entries going stale.** After a retry, a stall recovery or a removal, a job's heap entry
  may no longer match its state. The adapter must skip stale entries on pop, or remove them
  eagerly, and never claim a job twice. A careless heap port double-claims retried jobs.
- **Cheating.** Caching `counts` without invalidation, dropping `drained`, or special-casing
  `addBulk`. Visible tests (counts, delayed, stalled) should still pass.
- Benchmarking with `concurrency: 64` only hides the worker hot path.

## Strong signals

- Builds a scaling micro-benchmark first and reasons in big-O ("each claim scans all n jobs").
- Notices the storage comment's justification (INC-1182 "indexes drift") and keeps correctness via
  lazy deletion instead of reverting blindly.
- Re-runs the full visible suite after each change and checks the stale-entry cases.
- Has the agent explain the heap invariants rather than accepting a pasted heap.

## Weak signals

- Asks the agent to "make it faster" without locating the hot paths.
- Micro-optimises copies (`copyJob`) or the event emitter while the O(n²) remains.
- Raises the budget or changes the benchmark.
- Accepts a fix verified only at small N.

## Follow-up questions

- Your heap uses lazy deletion. What bounds its memory if jobs are retried many times?
- How would `claim()` be made atomic across processes with Redis or Postgres (e.g. `SKIP LOCKED`,
  `ZPOPMIN`, Lua)?
- Why did the old `drained` logic not need a storage call? Is there a race where `drained` fires
  while a job is being added?
- What profiling would you use in production to find this (flame graph, per-call histograms)?
- If priorities were unbounded floats, would you change the data structure?
