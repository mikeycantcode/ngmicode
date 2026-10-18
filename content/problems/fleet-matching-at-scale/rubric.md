## Intended approach
Measure first: time `flush()`, then time one `findAvailableNear` call. Nearly all the cost is `DriverRegistry.findAvailableNear`. It (1) copies and filters all 10k drivers per request, and (2) sorts the full list with a comparator that calls `haversineKm` twice per comparison: O(n log n) haversines per request, ~250M in total. Then notice that `GridIndex` exists, is still constructed and injected, but is unused. `updateLocation` stopped calling `index.upsert` (the "FLEET-201 stale cells" note is a red herring: the index handles moves correctly). The fix is to restore index maintenance in `updateLocation` and to query `index.queryRadius(center, radius, accept)` with the dispatchable filter. The index already sorts by (distance, id), and the `limit` is honored. The reference flush drops from ~6.5 s to ~100 ms.

## Key files
- `src/drivers/driver-registry.ts` (hot path, and the missing `index.upsert`)
- `src/geo/grid-index.ts` (existing index: `queryRadius`, `upsert`)
- `src/matching/batch-dispatcher.ts` (the algorithm; it is not the bottleneck)
- `src/app.ts` (index is wired into the registry)

## Traps
- **Index maintenance:** switching the query to the index without restoring `upsert` on location updates returns nothing, or stale positions. The hidden test moves drivers between far-apart cells.
- **Status and staleness:** the index holds every driver that ever pinged. Offline, on-trip and stale drivers must be filtered (the `accept` callback, or post-filter before applying `limit`).
- **Limit vs filter order:** applying `limit` before filtering out undispatchable drivers changes results.
- **Tie-breaks:** results must stay sorted by (distance, id). The batch output is compared pair-for-pair against a brute-force reference.
- A cheaper partial fix: precompute distances once and filter before sorting. It is ~10x faster but still O(n) per request, which is borderline on the budget and doesn't scale. Good candidates explain why the index is the right fix.
- Micro-optimizing `BatchDispatcher` itself (the pair sort is only ~8k pairs) wastes time.

## Strong signals
- Times components before changing code, and states the complexity (R × n log n haversines).
- Spots the unused index and the comment's misleading claim, and verifies the claim instead of trusting it.
- Adds a regression or perf test, and a correctness check against the old implementation on a seeded workload.

## Weak signals
- Asks the agent to "optimize matching" and accepts a rewrite of the batch algorithm that changes assignments.
- Caches results across flushes or uses snapshots that ignore pings.
- No measurement before or after.

## Follow-up questions
- What's the complexity now, per request, in terms of driver density and radius? When does the uniform grid degrade (dense downtown vs sparse suburbs)?
- How would you choose `cellDeg`? What changes at 100k drivers in one city?
- Location pings are ~95% of write traffic. What does index maintenance cost per ping? Could you batch it?
- Greedy-by-ETA isn't globally optimal. When would you use the Hungarian algorithm or min-cost flow, and what would it cost at this size?

_Note: the hidden perf test allows 2 s to absorb noisy CI machines. The reference solution flushes in ~100 ms and the starter takes 6–16 s, so a candidate's own timing evidence matters more than the threshold._
