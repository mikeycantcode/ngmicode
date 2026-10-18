## Intended approach
Measure first (time each phase, or reason about complexity), then fix the three hot spots:
1. **`InventoryService.available()` is O(active reservations)**: `reserved` is derived by scanning every
   reservation on every call ("single source of truth" after incident #77). Search calls it for
   every variant: 100k × 2k ≈ 2e8 iterations. Fix: maintain a per-SKU reserved counter (or an
   index sku → reserved) updated in reserve/release/commit/expire. Keep the drift concern
   in mind: update it in exactly the places that change reservation status, optionally with a
   debug consistency check.
2. **Duplicate guard in search is O(n²)**: `candidates.some(c => c.product.id === product.id)`.
   Products are unique by id, so remove it (or use a Set).
3. **Facets are O(categories × n)** via `names.includes` plus `filter` per category. Use a single counting pass.
Plus: `products.list()` deep-clones 50k products per request; use the existing `scan()`.
The base solution search is ~50 ms for the three queries in Node.

## Key files
- `src/catalog/search.ts`
- `src/inventory/inventory-service.ts` (`available`, `reservedFor`, `level`)
- `src/repo/memory.ts` (`scan()` exists for exactly this)
- README "Conventions" (repositories clone; scan is the escape hatch)

## Traps
- Fixing only search: still ~1 s because `available()` dominates. The hidden test needs both fixes.
- Adding a search result/index cache with no invalidation. Deactivation, repricing or reservations then serve stale results (hidden test 2).
- Caching `available` per request is fine; caching across requests without hooking reserve/release is not.
- Reintroducing the counter but forgetting one path (`expireStale`, `commit`, or `release`), which brings back the drift the comment warns about.
- Changing facet semantics (they ignore the category filter on purpose).

## Strong signals
- Profiles or instruments before changing code; quantifies each hot spot.
- Reads the incident #77 comment and explains how the new design avoids drift (single mutation points, invariant check, tests for release/commit/expire).
- Keeps behavior identical and runs the visible search/inventory tests.
- Explains complexity before and after: O(n·r + n² + c·n) → O(n log n) for sorting.

## Weak signals
- Lets the agent add caching without discussing invalidation.
- Micro-optimizes string handling while leaving the quadratic loops in place.
- Can't explain why the request got slower as reservations grew.

## Follow-up questions
- What would you do at 5M products? (inverted index, precomputed facets, a search engine)
- How would you prove the reserved counter can never drift? What metric or alarm would you add?
- Sorting is still O(n log n) for the first page. How would you avoid sorting everything for `pageSize=24`?
- If you added a cache, what would the invalidation events be, and who emits them today?
