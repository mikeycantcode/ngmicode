# A real `--filter` language

`--filter` only accepts exact package names today. Teams want the selector syntax they're used to
from other monorepo tools.

## Selectors

| Selector | Selects |
|---|---|
| `@acme/web` | that package |
| `@acme/ui*` | packages whose **name** matches the glob |
| `./apps/*` | packages whose **directory** matches the glob (a leading `./` means "directory") |
| `@acme/web...` | the package **and all its transitive workspace dependencies** |
| `...@acme/ui` | the package **and all its transitive dependents** |
| `!<selector>` | **exclude** whatever the selector matches |

The `...` forms combine with globs and directories: `./apps/*...`, `...@acme/ui*`.

## Combination rules

- Several `--filter` flags, or a comma-separated list, are a **union** of the inclusion selectors.
- Exclusions apply **after** all inclusions, whatever the order they were given in.
- With only exclusions, start from all packages.
- An inclusion selector that matches no package is an error: exit code 1, structured error
  `{ code: "E_FILTER", message: 'No packages matched filter "<selector>"' }`. This replaces the
  current "Unknown package" error for filters.

## Where it applies

Every command that accepts `--filter` today must use the same semantics: `build`, `test`
**and** `affected`. For `affected`, the filter restricts which packages can appear in
`changedPackages` and `affected`.

For `build`/`test`, selected packages are the entry points. Their task dependencies are still
pulled in, as today.

## Acceptance
- The examples above work through the CLI.
- Existing tests still pass. Update them only where this brief changes documented behavior.
