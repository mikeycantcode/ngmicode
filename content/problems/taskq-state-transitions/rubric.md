## Intended approach

Introduce a single helper, e.g. `transition(deps, job, from, to, patch, lockToken?)` in
`src/core/transitions.ts`, that:

- calls `assertTransition(from, to)`;
- writes with `storage.finish(id, token, …)` when the caller holds the lock (worker outcomes, stall
  recovery fenced on the observed token), or `storage.compareAndSet(id, {state: from}, …)`
  otherwise;
- emits `state:changed` only if the write happened.

Then migrate every call site. `claim()` is an atomic storage op, so the worker announces
`waiting → active` right after a successful claim. There are about 10 sites:

| site | transition |
|---|---|
| `worker.fill` after claim | waiting → active |
| `lifecycle.complete` | active → completed |
| `lifecycle.fail` (backoff > 0 / = 0) | active → delayed / waiting |
| `lifecycle.failForGood` | active → failed |
| `scheduler.promoteDue` | delayed → waiting |
| `scheduler.checkStalled` | active → waiting / failed |
| `deps.tryUnblock` / `deps.onFailed` | blocked → waiting / failed |
| `dlq.replay` | failed → waiting (bypassed the machine: FIXME) |
| `admin.promote` / `admin.retryFailed` | delayed → waiting / failed → waiting (bypassed) |

`admin.promote` needs an explicit `state === "delayed"` guard. `active → waiting` is legal in the
table (retries, stalls), so `assertTransition(job.state, "waiting")` alone still lets an active job
be promoted. Hidden test 3 checks the active case.

## Key files

- `src/core/state-machine.ts` (TODO platform#311 lists the bypassing modules)
- `src/worker/worker.ts`, `src/worker/lifecycle.ts`
- `src/scheduler/scheduler.ts`
- `src/queue/dependencies.ts`, `src/queue/dead-letter.ts`
- `src/api/admin.ts`
- `src/events/events.ts`

## Traps

- **Missing sites.** The worker claim (inside storage), the stall path, and the cascade failure in
  deps are easy to miss. Hidden test 2 walks dependency, DLQ and stall paths.
- **Losing fencing.** Replacing `finish(token)` or the stall CAS with plain `update` while
  refactoring re-introduces the lost-ack race. A strong candidate keeps the lock token in the
  helper.
- **Double emission.** Emitting in the helper *and* leaving an ad-hoc emit, or emitting before the
  CAS (so a lost CAS still emits).
- **Promote guard** (see above).
- **Emitting on creation**, which the brief excludes.
- Sprint scale: about 8 files. Unsupervised agents often stop after `lifecycle.ts`.

## Strong signals

- First has the agent inventory every write of `state` (grep `state:`, `update(`,
  `compareAndSet(`, `finish(`) into a table, then migrates site by site.
- Defines the helper's contract (atomicity, return value on a lost race, when it throws) before the
  migration.
- Adds a test that asserts exact transition sequences for one job through retry, not just "an event
  fired".
- Mentions the `active → waiting` legality subtlety for promote.

## Weak signals

- Adds `emit("state:changed")` next to each existing write without validation or atomicity.
- Wraps `storage.update` globally (e.g. monkeypatching storage). That loses `from` and couples
  storage to events.
- Doesn't re-run the visible suite.

## Follow-up questions

- Why emit after the write rather than before? What does a consumer see if the process crashes in
  between (outbox pattern)?
- Could `state:changed` events for the same job arrive out of order? When?
- How would you enforce "no direct state writes" going forward (lint rule, storage API shape)?
- Is `active → waiting` in the table too permissive? How would you model "who" may perform a
  transition?
