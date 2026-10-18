# removeOnComplete / removeOnFail retention

## Context

A high-volume queue keeps every completed job record forever, and the
in-memory store reaches 2 GB by Friday. Today we run `admin.clean` from cron.
We want per-job retention options, BullMQ style.

Your agent is in **literal mode**: it does exactly what you say. You are
delegating a change that touches option types, validation and the worker's
completion and failure paths. It should land with no surprises. You may (and
should) tell it exactly where things go. Relevant places:
`src/core/types.ts` (`JobOptions`, `NormalizedJobOptions`),
`src/core/job.ts` (`normalizeJobOptions`) and `src/worker/lifecycle.ts`.

## Spec

**Options.** `JobOptions` gains `removeOnComplete?: boolean | number` and
`removeOnFail?: boolean | number`. Both can be set in a queue's
`defaultJobOptions`. A job's own value always wins, **including an explicit
`false`**.

**Validation.** Run this in `normalizeJobOptions` on the merged value. Each
option must be `undefined`, a boolean, or a non-negative integer. Otherwise
throw `InvalidJobOptionsError("<optionName> must be a boolean or a non-negative integer")`.

**When it runs.** Only in the worker lifecycle:

- `removeOnComplete` runs after a job completes. The `completed` event has
  already been emitted and its dependents have already been processed.
- `removeOnFail` runs after a job fails *for good*. The `failed` event has
  already been emitted, and the DLQ and dependents have already been handled.
  It does **not** run on a failed try that will be retried.

The completing or failing job's own option decides what happens.

**Policy values.**

| value | effect |
|---|---|
| `undefined` / `false` | nothing |
| `true` or `0` | remove **only this job** |
| `N > 0` | look at **all** jobs of this queue in the same terminal state, regardless of their own options. Keep the N most recent and remove the rest. "Most recent" means larger `finishedAt`; on a tie, larger `seq` is more recent. |

**Never removed, under any policy:**

1. A job that has an entry in the dead-letter queue (`dlq.has(id)`).
2. A job that has at least one dependent currently in state `blocked`.

Protected jobs still count toward the N kept. They are skipped, not replaced.

**Removal.** Delete the record from storage and emit `removed` with
`{ queue, jobId, prevState }` for each removed job, oldest first.

## Acceptance criteria

- The spec above, exactly. Existing visible tests still pass.
- Don't change `admin.clean` or the stalled-job and dependency-cascade
  failure paths.
