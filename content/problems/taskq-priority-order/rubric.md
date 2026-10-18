## Intended approach

The root cause is in `src/utils/heap.ts`, `siftDown` (overlay). The second child comparison
compares the right child to the **left child** instead of to the current `smallest`:

```ts
if (right < n && this.compare(items[right], items[left]) < 0) smallest = right;
```

When the parent is already smaller than both children but `right < left`, the parent gets swapped
down below a larger element. That breaks the heap invariant, and later pops return the wrong
element. With fewer than about 4 items, the right-child branch rarely meets that configuration, so
small tests pass.

Fix: compare against `items[smallest]`. A strong candidate:

1. Writes a repro through the public API (N ≥ 30 equal-priority jobs, `concurrency: 1`, record
   order).
2. Narrows the cause down: the comparator in `memory-storage.ts` (`priority` then `seq`) is
   correct, so the bug must be in the heap.
3. Adds a direct heap property test (random pushes, then pops must come out sorted) and fixes
   the bug.

## Key files

- `src/utils/heap.ts` (bug)
- `src/storage/memory-storage.ts` (comparator `byPriority`, lazy stale entries: a red herring)
- `src/worker/worker.ts` (claim loop: a red herring)

## Traps

- **Blaming the comparator or `seq`.** Agents often "fix" by changing `byPriority` or by sorting the
  heap on every pop (`toArray()`). That hides the bug, makes claims O(n log n), and leaves the
  delayed heap (same class) broken.
- **Blaming worker concurrency or async races.** The report says `concurrency: 1`, and the
  ordering is wrong even with no concurrency.
- **Rewriting the heap from scratch** without understanding the bug. That is acceptable only if the
  candidate can still name the defect.
- The `// pick the smaller child` comment makes the line look intentional.

## Strong signals

- Builds a scaling repro (5 jobs pass, 40 fail) and uses it to argue that the problem is structural,
  not a race.
- Asks the agent to check the heap invariant after each operation, or writes a property test
  against `BinaryHeap` directly.
- Notes the delayed-jobs heap shares the bug, so delayed jobs could also be promoted late.

## Weak signals

- Accepts "added a sort in claim()" as the fix.
- Can't explain why small queues didn't show it.
- No regression test.

## Follow-up questions

- What invariant does a binary heap maintain? Which operations could break it?
- The delayed heap uses the same class. What would this bug have done to delayed jobs?
- How would you property-test a priority queue? What generator would you use?
- With a Redis sorted set, how do you get FIFO tie-breaking within a priority?
