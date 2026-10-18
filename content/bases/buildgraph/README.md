# buildgraph

A small monorepo build orchestrator in the spirit of Turborepo / Nx. Given a workspace
of packages, it figures out what depends on what, runs package scripts in the right
order with bounded parallelism, and skips work whose inputs haven't changed by
restoring outputs from a content-addressed cache.

Everything runs against a **virtual filesystem** and an **injectable clock**, so the core
has no Node dependencies and every run is deterministic in tests.

```
buildgraph build  [--filter <pkg>]... [--concurrency N] [--force]
buildgraph test   [--filter <pkg>]... [--concurrency N] [--force]
buildgraph graph  [--task <task>]
buildgraph affected <file>... | --files a,b
buildgraph install [--frozen]
```

## Layout

| Path | What lives there |
|------|------------------|
| `src/core/` | Error hierarchy (`BuildGraphError` + `code`), typed `EventBus`, in-memory logger |
| `src/utils/` | Deterministic hash (FNV-1a, 64-bit, no `crypto`), stable JSON, globbing, POSIX path helpers |
| `src/vfs/` | `VirtualFS` interface, `MemoryFS`, `TrackedFS` (records changed paths) |
| `src/semver/` | SemVer 2.0.0 parse / compare / ranges (`^ ~ x-ranges || >= <`), npm prerelease rule |
| `src/workspace/` | `package.json` parsing + validation, workspace discovery, internal package graph |
| `src/resolver/` | External dependency resolution against a `Registry`, lockfile (de)serialization |
| `src/config/` | `buildgraph.json` loading: defaults < file < CLI overrides; per-package task overrides |
| `src/graph/` | Generic `Graph` (topo sort, cycle paths, layers) and the task graph builder |
| `src/cache/` | Task hashing, cache stores (memory / on-VFS), output collection + restore |
| `src/scheduler/` | `Clock` / `ManualClock`, the concurrency-limited DAG scheduler |
| `src/runner/` | Script executor (simulated toolchain) and `runTasks`, which ties everything together |
| `src/affected/` | Changed files -> owning packages -> transitive dependents |
| `src/cli/` | argv parsing, commands returning `{ exitCode, output, text }`, text formatting |

## Concepts

**Workspace.** The root `package.json` lists `workspaces` globs; every matching directory
with a `package.json` is a package. Workspace deps may use `workspace:*` / `workspace:^`,
or a plain range that the local version satisfies. Anything else goes to the registry.

**Pipeline.** `buildgraph.json` declares tasks:

```json
{ "pipeline": { "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
                "test":  { "dependsOn": ["build"] } } }
```

`^build` = the build task of every workspace dependency; `build` = the same package's
build; `@acme/x#build` = a specific task. A package only gets a task node if it has a
script of that name. Packages can override task settings via a `"buildgraph"` key in
their own `package.json`.

**Task ids** are `<package>#<task>`, e.g. `@acme/ui#build`.

**Hashing.** A task's hash covers: its script, the content hash of each input file in its
package (`inputs` globs minus `outputs`), the *hashed* values of the env vars it declares,
the hashes of the tasks it depends on (so upstream changes propagate transitively), and
a global hash (global dependency files + `globalEnv`). Hashes are computed right before
a task runs.

**Cache.** On a hit we restore the recorded outputs into the package directory and replay
logs. On a miss we execute, then capture outputs. `FsCacheStore` keeps entries as JSON
under `.buildgraph/cache/` — this directory is shared between CI jobs, so its contents
are not trusted.

**Scheduler.** Tasks start in topological order as soon as their deps succeed, with at
most `concurrency` in flight. Fail-fast: after the first failure nothing new starts,
running tasks finish, and everything left is `skipped`.

**Executor.** We don't spawn processes. `ScriptExecutor` interprets a tiny `&&`-chained
script language (`compile src dist`, `sleep 30`, `echo ...`, `fail ...`) — see
`src/runner/executors.ts`. Durations are virtual (driven by the `Clock`).

## Testing

`tests/fixtures.ts` builds the "acme" sample repo (5 packages) and a fake registry.
Tests that run tasks use `ManualClock` and drive it with `clock.run(promise)`.

## Conventions

- Library code throws `BuildGraphError` subclasses; the CLI maps them to `{ ok: false, error: { code, message } }`.
- All listings are sorted (by id / path, code-unit order) so output is deterministic.
- Paths are root-relative POSIX paths; never build them with string concatenation if a helper in `utils/paths.ts` exists.
- Env values never appear in hashes or logs in clear text.

## Known issues / TODO

- `legacyHash` and `simpleMatch` are only kept for the v0.1 cache/config format; remove in 1.0.
- `concurrency` should default to the host CPU count.
- No remote cache yet (see RFC-12).
