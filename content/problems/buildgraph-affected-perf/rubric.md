## Intended approach
Profile or read `src/affected/affected.ts` and find three hot spots:
1. `ownerOf` scans every package for every file and sorts the candidates: O(F·P) `isWithin` calls,
   and each call re-normalizes paths. Fix: build a `Map<dir, name>` once, then walk up each file's
   `dirname` chain. That's O(F·depth), and the first hit is automatically the longest prefix.
2. The dependents BFS iterates **all packages** for each dequeued node and calls
   `pkgGraph.successors(candidate)` (allocates and sorts) to test an edge: O(P²·deg). Fix: use
   `pkgGraph.predecessors(n)` (the reverse adjacency already exists) for O(P + E).
3. `changed` / `affected` / `owners` are arrays with `.includes`: O(P²). Use Sets. `queue.shift()` is minor.
Also: the global check re-normalizes per glob. It's minor, but a strong candidate notices it.
Must preserve: BFS order (sorted initial queue, discovery order) so `reasons` stays identical;
early return on global; skipping root files.

Before: O(F·P·L + P²·d·log d) where L is the path length. After: O(F·depth + P + E + P log P).

## Key files
- `src/affected/affected.ts`
- `src/graph/dag.ts` (`predecessors`, `transitiveDependents`)
- `src/utils/paths.ts` (`dirname`, `isWithin`)

## Traps
- Fixing only the owner lookup. The test is still too slow because of the O(P²) BFS (≈190 ms vs a 100 ms budget).
- Replacing the BFS with `transitiveDependents()` per changed package: fast, but `reasons` would then name
  the wrong (non-closest) package or depend on iteration order.
- Owner lookup via "first two path segments" or `startsWith(dir)` breaks nested packages and `ui` vs `ui-kit`.
- Dropping the "root-level non-global file is ignored" rule, or changing `changedPackages` on the global path.
- Caching across calls in module state (explicitly disallowed; also a stale-workspace bug).

## Strong signals
- Measures first: a quick benchmark harness, and identifies *each* hot spot with numbers.
- States complexity before and after. Reuses the existing reverse adjacency.
- Pins current behavior with characterization tests (reasons, nested packages) before optimizing.

## Weak signals
- "Make it faster" to the agent, accepting a rewrite without diffing behavior.
- Micro-optimizations (for loops instead of map) that leave the asymptotics unchanged.
- Can't explain why the result is still slow after the first fix.

## Follow-up questions
- What's the worst case for your owner lookup? Could a trie beat the dirname walk?
- If the PR bot needs `reasons` to show the full path (`web -> ui -> utils`), how would you compute it cheaply?
- The CI also runs `build --filter` on the affected set. Where's the next bottleneck?
- How would you guard against a performance regression in CI without flaky timing tests?
