## Intended approach
Read `src/cli/commands.ts` first and *diff* `build` against `test` before touching anything. The copies
have drifted: `test` ignores `--concurrency` (no override passed to `config()`) and ignores `--force`.
Extract a single `runCommand(name, tasks, args)` helper that does flag validation, config overrides,
filter and force. Implement `build`/`test`/`run` on top of it. `run` takes `args.positionals` as task
names; an empty list is `E_USAGE`. Unknown tasks already raise `ConfigError` from `buildTaskGraph`,
which maps to exit 1. Add characterization tests for the drifted flags before refactoring.

## Key files
- `src/cli/commands.ts` (duplicated commands, `runOutput`, `usage`)
- `src/cli/args.ts` (positionals vs flags)
- `src/runner/task-runner.ts` (`runTasks` already accepts multiple tasks)

## Traps
- **Drift.** A mechanical "extract method" from `test` preserves its bugs. Extracting from `build` and
  never noticing the difference is a weak signal, even if tests pass.
- **Backward-compatible `command` field.** Making aliases report `command: "run"` breaks CI parsers.
- `run lint test` must be one graph (one `runTasks` call with both tasks), not two sequential runs.
  Sequential runs double the time and duplicate the shared `build` nodes.
- `parseArgs` treats task names as positionals only if they're not consumed as flag values. `--filter x lint`
  would eat `x`. The candidate should know which flags take values.

## Strong signals
- Lists the behavioral differences between the copies before refactoring, and says which are bugs.
- Pins `build` behavior with tests first, then refactors, then adds `run`.
- Small, reviewable diff; deletes more than it adds.

## Weak signals
- Asks the agent to "refactor and add run" in one step and doesn't review the diff.
- Copies the block a third time for `run`.
- Doesn't mention the `--concurrency` / `--force` drift when asked what changed.

## Follow-up questions
- What other duplicated logic in this codebase would you consolidate next, and how would you prioritize?
- How would you prove a refactor is behavior-preserving beyond the existing tests (golden outputs, shadow runs)?
- `run build` vs `build`: should they differ in any way (e.g. telemetry, deprecation)? How do you deprecate a command safely?
- How should `run` behave if one of several requested tasks exists in no package at all?
