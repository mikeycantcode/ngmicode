## Intended approach
Map the flow before prompting: `cli/commands.ts` builds a `RunContext` -> `runner/task-runner.ts` does
lookup/execute/put per task inside the scheduler's `run` -> `cache/cache-store.ts` / `cache/outputs.ts`
-> `config/*` (defaults + validation; `TOP_KEYS` derives from `DEFAULT_CONFIG`, so the new key must go
into defaults or the config loader rejects it). Plan:
1. `RemoteCache` interface next to `CacheStore`. Config `remoteCache` with defaults + validation.
2. Runner: local -> remote lookup with try/catch -> restore + backfill + `cacheSource`.
3. Upload: start `remote.put` without awaiting inside the task. Push the promise (with a `.catch` that emits `warn`)
   into a list, and `await Promise.all(uploads)` after `runSchedule` resolves.
4. Thread through the CLI context, output (`cacheSource`) and text summary.
Test each with a fake remote driven by `ManualClock`.

## Key files
- `src/runner/task-runner.ts`, `src/cache/cache-store.ts`, `src/cache/outputs.ts`
- `src/config/defaults.ts`, `src/config/types.ts`, `src/config/config.ts`
- `src/cli/commands.ts`, `src/cli/format.ts`, `src/core/events.ts`

## Traps
- **Awaiting the upload inside the task** delays every dependent by the upload latency. The hidden test checks that `ui#build` starts at t=10, not t=1010.
- **Fire-and-forget without tracking**: the run resolves while uploads are pending, so remote entries are missing.
- An unhandled rejection from a failed upload or a failed `get` crashes or fails the run.
- **Config key rejected**: adding `remoteCache` to types but not to `DEFAULT_CONFIG` means `buildgraph.json` throws "unknown key".
- Not backfilling local, so every run pays the remote latency.
- `--force` must skip remote reads too. `cache: false` tasks must never touch the remote.
- Restoring remote entries without the same safety as local ones (they are even less trusted). Bonus if the candidate raises it.

## Strong signals
- Sketches the timeline of lookup/execute/upload against dependents before coding.
- Splits work into config / runner / CLI steps and verifies each with a fake remote.
- Handles failure modes explicitly: get fails, put fails, slow put.
- Mentions trust: remote entries are attacker-reachable.

## Weak signals
- One mega-prompt, then accepting a diff that awaits uploads inline.
- No fake remote; "tested" by reading the code.
- Ignores the CLI text/output parts of the brief.

## Follow-up questions
- Remote gets add latency to every miss. How would you avoid a serial round-trip per task (batch existence checks, prefetch)?
- Two CI jobs upload the same hash concurrently. Is that a problem? What about a partially-written entry?
- How would you bound memory/time if 500 uploads are pending at the end of a run?
- How should a remote cache be authenticated for fork PRs that must read but never write?
