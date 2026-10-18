## Intended approach
Orient first: `cli/commands.ts` (build/test) -> `runner/task-runner.ts` (`runTasks`, `planTasks`, and the
already-existing `hashTaskGraph`) -> `cache/cache-key.ts`. The cheapest correct solution reuses
`planTasks` + `hashTaskGraph` and checks `cache.has(hash)` (read-only), with no execution.
`dependsOn` comes from `tg.graph.successors(id)`, which is already sorted. `cache: "DISABLED"` comes from `node.def.cache`.
Both `build` and `test` need the flag (they're duplicated in the CLI, a second code path).

## Key files
- `src/cli/commands.ts`, `src/cli/args.ts` (`--dry-run` parses to `flags["dry-run"]`)
- `src/runner/task-runner.ts` (`planTasks`, `hashTaskGraph`, and the comment about lazy hashing)
- `src/cache/cache-key.ts`, `src/cache/cache-store.ts`

## Traps
- **Reimplementing the hash.** A weak model will write its own "hash of files" and the hashes won't
  match the real run. The hidden test compares them exactly.
- **Calling `runTasks` with a fake executor.** It still restores outputs on hits and writes to the cache.
- `cache.get` on `FsCacheStore` is read-only, but restoring outputs (`restoreOutputs`) is a write.
- Adding the flag to `build` only; `test` is a separate copy-pasted command.
- Forgetting cache:false (`DISABLED`).
- Order: must be topological like the real run (`order`), not `graph.nodes()` (alphabetical).

## Strong signals
- Asks the agent to *explain* the hashing pipeline first (or reads it themselves), then feeds it the exact functions to reuse.
- Notices `hashTaskGraph` exists and reads its comment about the difference from lazy hashing.
- Verifies "nothing runs" with a test (executor counter / fs snapshot / cache size).

## Weak signals
- One big prompt: "add --dry-run" with no file pointers. The weak agent loses context and duplicates logic.
- Doesn't compare dry-run hashes with a real run.
- Doesn't check `test --dry-run`.

## Follow-up questions
- On a fresh clone (no `dist/`), would `test --dry-run` hashes match the real `test` run? Why not, and does it matter?
- How would you add `--summarize` that explains *which input* changed between two hashes?
- Should the dry run consult the remote cache? What are the latency and privacy implications?
- What's the risk of exposing hashes of env vars in the dry-run output?
