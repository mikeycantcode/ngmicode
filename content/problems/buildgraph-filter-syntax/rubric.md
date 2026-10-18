## Intended approach
Orient: `cli/args.ts` (`flagList` already splits commas and repeated flags) -> `cli/commands.ts`
(build and test duplicate the filter handling, and `affected` doesn't accept `--filter` at all, the
second code path) -> `workspace/package-graph.ts` + `graph/dag.ts` (`transitiveDependencies`,
`transitiveDependents`) -> `utils/glob.ts` (`matchGlob`). Design a small pure function, for example
`selectPackages(ws, pkgGraph, selectors): string[]`, with a parsed selector type
`{ exclude, deps, dependents, kind: "name" | "dir", pattern }`. Unit test it, then wire it into all three commands.
Update the visible CLI test's error expectation (E_CONFIG -> E_FILTER).

## Key files
- `src/cli/commands.ts`, `src/cli/args.ts`
- `src/graph/dag.ts`, `src/workspace/package-graph.ts`, `src/utils/glob.ts`
- `tests/cli.test.ts` (error code assertion changes)

## Traps
- **`affected` is a second code path.** The agent wires build/test and forgets affected.
- Exclusions applied in argument order instead of after all inclusions.
- `...` parsing: strip `!` first, then leading/trailing `...`. The `./` dir form combines with `...`.
- Directory globs must match `pkg.dir` with `./` stripped. Matching against the name silently selects nothing.
- Error only for *inclusion* selectors that match nothing, and with the exact code/message.
- Hand-rolled regex globbing instead of reusing `matchGlob`.

## Strong signals
- Designs the selector as data (parse -> evaluate) and keeps the evaluator pure and testable.
- Writes a table-driven test for the evaluator before wiring.
- Greps for every `filter` usage before declaring done.
- Discusses API design: what `...` means for tasks vs packages, error vs empty selection.

## Weak signals
- String-munging inside each command.
- Ships without running the existing suite, or "fixes" the visible test by loosening it.
- Never exercises `affected --filter`.

## Follow-up questions
- Should `@acme/web^...` (dependencies but not the package itself) exist? How would your parser extend?
- How would you add a git-based selector (`[main]` = changed since main) without coupling the evaluator to git?
- An exclusion that matches nothing: error, warning or silent? Argue it.
- How do you version a CLI mini-language like this so scripts in CI don't break?
