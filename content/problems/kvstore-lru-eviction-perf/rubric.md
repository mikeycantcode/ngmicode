## Intended approach
Profile the eviction path: `Dispatcher.execute` → `Evictor.ensureBudget` → `Keyspace.usedMemory`
and `lruOldest`. The starter has two independent O(n) hot spots:
1. `usedMemory` is a getter that re-sums `entrySize` over **every** key, and so over every list
   element and hash field, on every call. `ensureBudget` calls it on every write and on every
   loop iteration.
2. `lruOldest` scans the `lastAccess` map for the minimum stamp. That's O(n) per eviction.

Fix both:
- **Incremental accounting.** Store `size` on each `Entry`. Update `usedMemory` by the delta in
  `set` (new size minus previous size), in `mutated` (re-measure that one key), in `removeEntry`
  (subtract), and in `flush` (reset to 0). Every mutation path already funnels through these
  methods. That is what makes incremental accounting safe and answers the "drift" comment.
- **O(1) LRU.** A `Map` used as an ordered set (delete and re-insert on touch; oldest is
  `keys().next()`), or a doubly linked list with a hash map. `volatile-lru` can scan in LRU
  order with a filter, which stays correct.

Complexity of one SET under eviction: before, O(n·avg value size) for accounting plus O(n) for
victim selection; after, O(size of the written value) plus O(1) amortized.

## Key files
- `src/core/keyspace.ts`: `usedMemory`, `set`, `mutated`, `removeEntry`, `flush`, `touch`, `lruOldest`
- `src/core/eviction.ts`: `ensureBudget` loop
- `src/core/sizeof.ts`: `entrySize`
- `src/server/dispatcher.ts`: where eviction runs (before `denyoom` commands)

## Traps
- **Fixing only one hot spot.** O(1) LRU with the O(n) getter is still slow, and so is the
  reverse. Test 1 needs both.
- **Forgetting `mutated()`.** A weak agent adds `+= size` in `set` and `-= size` in delete but
  forgets in-place mutation. LPUSH, HSET and APPEND then drift. Test 3 compares against a full
  recomputation after many in-place ops.
- **Forgetting reads in LRU.** If the new structure is updated only on writes, GET no longer
  refreshes recency. Test 2.
- **Double counting on overwrite.** Adding the new size without subtracting the previous entry's size.
- **`flush` not resetting** the counter or the LRU structure.

## Strong signals
- The candidate has the agent read `ensureBudget` and the keyspace accessors first, and states
  the complexity of each before touching code.
- The candidate feeds the weak agent one change at a time (accounting, then LRU) with the
  invariant written down: "every mutation goes through set/mutated/removeEntry/flush".
- The candidate writes an accounting check that compares the counter against a full recompute
  after mixed commands.
- The candidate measures before and after.

## Weak signals
- Caching `usedMemory` with a dirty flag that still recomputes everything whenever it's dirty.
  That's still O(n) per write.
- Approximated LRU (random sampling) without discussing the semantic change.
- Accepting the agent's change without an accounting check.

## Follow-up questions
- Redis uses *approximated* LRU (sampling plus an eviction pool) instead of an exact list. Why? What's the trade-off at 100M keys?
- `mutated()` re-measures the whole aggregate, which is O(len) for an LPUSH on a long list. How would you make in-place updates O(1) for accounting?
- How would you implement LFU on top of this structure?
- Eviction runs before the command, so one big write can overshoot `maxmemory`. When is that acceptable? How would you bound it?
