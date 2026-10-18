# Test the dependency graph properly

The generic `Graph` class (topological sort, cycle detection, transitive closures, layers) is
the heart of buildgraph. Its tests are thin. Meanwhile, users file tickets like this one:

> My cycle error says `Cycle detected: @acme/docs#build → @acme/ui-kit#build → @acme/ui#build → @acme/utils#build → @acme/web#build → @acme/ui#build`.
> `docs` isn't even part of the cycle! I spent an hour on the wrong package.

Your agent is an older, smaller model. Make it do the work in small, checkable steps.

## The ask

1. **Test helper.** Add `tests/helpers/graph.ts` exporting
   `graphFromEdges(spec: string): Graph`, so tests can write graphs compactly:
   - Items are separated by commas and/or newlines. Whitespace around tokens is ignored, and empty items are skipped.
   - `a -> b` adds the edge a→b (a depends on b). Chains are allowed: `a -> b -> c` adds a→b and b→c.
   - A bare name (`d`) adds an isolated node.
   - A malformed item (`a ->`, `-> b`, `a -> -> b`) throws an `Error`.
2. **Test suite.** Using the helper, write tests for the `Graph` class that pin down its documented
   contract: topological order and tie-breaks, cycle paths, self-loops, transitive
   dependencies/dependents, `layers()`, and `subgraph()`.
3. **Fix what the tests find.** Fix bugs in the source, not in the tests.

## Acceptance
- The helper behaves as specified.
- The cycle error reports only the nodes on the cycle, closed (first node repeated at the end).
- All tests pass.
