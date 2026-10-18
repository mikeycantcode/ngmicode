## Intended approach
Start in `src/scheduler/scheduler.ts`. Understand the existing state machine (`ready`, `running`,
`waitingOn`, `failed`, `pump`, `finish`) before prompting. Model the retry as: attempt fails ->
release slot (`running--`) -> `pending++` -> `clock.sleep(delay * 2 ** (attempts - 1))` -> `pending--`
-> if stopped mark failed else `enqueue(id)` -> `pump()`. `finish()` only when `running === 0 && pending === 0`.
Split the existing single `failed` flag into "stop starting new work" (fail-fast) vs. "the run is not ok".
continueOnError mostly falls out: dependents of a failed task never reach `waitingOn === 0`, so they
stay unstarted and are reported `skipped`. Then thread options through: `TaskDefinition` (+ config
key validation in `config.ts`, which rejects unknown keys), `runTasks` (pass `retries`, `continueOnError`,
record attempts), and the CLI flag.

## Key files
- `src/scheduler/scheduler.ts`, `src/scheduler/clock.ts`
- `src/runner/task-runner.ts`
- `src/config/config.ts`, `src/config/types.ts`, `src/config/defaults.ts` (TASK_KEYS derives from DEFAULT_TASK)
- `src/cli/commands.ts`

## Traps
- **Holding the slot during backoff** (sleeping inside `task.run`'s wrapper before decrementing
  `running`). That's the obvious implementation. Hidden test: with concurrency 1, the other task must
  start at t=10, not t=120.
- **Resolving early**: `finish()` when `running === 0` while a backoff is pending. The result then misses the retry.
- **Exceeding concurrency**: re-starting the retry directly from the timer callback instead of enqueuing.
- Exponent off by one (first backoff must be `retryDelayMs`, not `2×`).
- Overwriting `startedAt` on retry; attempts not counted.
- Config: `retries` rejected as an unknown key; or added to the hash (changing every cache key).
- Retrying in the runner by looping around `executor.execute` passes the runner test but holds the slot. That's the same trap one layer up.
- Fail-fast regression: a retryable failure must not stop the run.

## Strong signals
- Draws a timeline (or writes the timing test first) under ManualClock before implementing.
- Recognizes that continueOnError is mostly about *not* stopping, and that skip semantics already exist.
- Puts retry in the scheduler, not the executor, and says why (slots, observability).
- Verifies `maxConcurrency` and the end time precisely.

## Weak signals
- `setTimeout` or real time instead of the injected clock.
- Accepts an implementation that only passes because concurrency is large in the test.
- No timing assertions; "it retried" is the only check.

## Follow-up questions
- Should retries add jitter? How would you keep runs deterministic in tests if so?
- A task's retry and a fresh ready task compete for a slot. Who should win, and does your order starve anything?
- Should cached results of a flaky task be trusted? Should a retried success be cached?
- How would you surface flakiness (attempts > 1) to developers without failing builds?
- With `--continue`, what exit code and summary should CI see for partial success?
