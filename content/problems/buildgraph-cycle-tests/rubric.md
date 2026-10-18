## Intended approach
Step 1: have the agent write the helper and a couple of tests *for the helper* (nodes/edges/errors).
Step 2: read the doc comments in `src/graph/dag.ts`. They are the contract (e.g. `findCycle`: "Only nodes
ON the cycle are included, never the path that led into it"). Turn each documented promise into a test.
Include a cycle reached via a tail (`x -> a, a -> b, b -> c, c -> b`), which fails.
Step 3: fix `findCycle` to slice the stack from the first occurrence of the re-entered node:
`[...stack.slice(stack.indexOf(m)), m]`. The existing test (`a -> b -> c -> a`, explored starting at `a`)
passes with the bug, which is why nobody noticed.

## Key files
- `src/graph/dag.ts` (`findCycle`, with the misleading inline comment "the DFS stack is the path that closed the loop")
- `tests/graph.test.ts` (existing thin tests)
- `src/core/errors.ts` (`CycleError` message format)

## Traps
- The existing cycle test passes. A test that starts DFS *on* the cycle never exposes the bug. You need a tail.
- The weak agent "fixes" the failing test's expectation to match the buggy output. The candidate must catch this.
- Helper parsing: chains, newline separators, whitespace and empty items. Throwing on `a ->`.
- Self-loop `a -> a` must report `["a", "a"]`.
- The ordering of DFS (sorted nodes/successors) matters for which cycle is reported in multi-cycle graphs. Tests should
  either choose graphs with one cycle or assert membership.

## Strong signals
- Derives tests from the documented contract instead of from current behavior.
- Includes the tail case deliberately, and explains why the old test missed the bug.
- Reviews the agent's tests for tautologies (asserting what the code currently returns).
- Keeps the helper small and tested itself.

## Weak signals
- Asks for "more tests" and accepts snapshot-style assertions of current output.
- Lets the agent change test expectations to make them pass.
- Doesn't connect the ticket to `findCycle`.

## Follow-up questions
- How would you find *all* cycles, or the shortest one, for a better error message? What's the cost?
- What property-based tests would you write for `topoSort` (e.g. every edge goes backwards in the order)?
- Your helper is test-only code. How do you keep it from drifting from `Graph`'s semantics?
- Why does Kahn's algorithm detect cycles but not explain them, and why do we run DFS afterwards?
