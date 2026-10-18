# Consolidate the task-running commands

Product wants `buildgraph run <task...>` so teams can run any pipeline task (`lint`, `typecheck`,
or several at once). Each new command must not become another copy of the build/test logic.

## The ask

1. Add `buildgraph run <task> [<task>...]`. It runs all the given tasks in **one** task graph, so
   `run lint test` schedules `lint`, `test` and their dependencies together. It accepts the same
   flags as `build` (`--filter`, `--concurrency`, `--force`). Its structured output has the same
   shape as `build`'s, with `command: "run"`.
2. `build` and `test` become thin aliases over the same code path. Their output keeps
   `command: "build"` / `command: "test"`. Scripts in CI parse that field.
3. `run` with no task is a usage error: exit code 2, `error.code === "E_USAGE"`.
   An unknown task behaves the way `build` does with an unknown task today.

## Ground rules

- **`build` is the reference behavior.** Wherever `build` and `test` behave differently today,
  that's a bug; make them consistent.
- Behavior-preserving otherwise. The visible test suite must stay green.
- Be ready to walk us through how you made sure nothing else changed.
