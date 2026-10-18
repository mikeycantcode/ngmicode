# `buildgraph affected` is slow in CI

The platform team moved the big monorepo (≈1,500 packages) onto buildgraph. CI computes the
affected set for every PR with `buildgraph affected <changed files...>`.

- A typical PR (a few files) takes ~1s just for `affected`.
- A big refactor PR touched ~6,000 files and `affected` took **several minutes**.

Profiling shows nearly all the time is inside the affected-detection module. Workspace loading
and graph building are fine.

## Your task

Make affected detection fast. Target: on a 1,500-package graph, a 6,000-file change set takes
well under 100 ms.

**The output must not change.** CI and the PR bot depend on every field. That includes
`changedPackages`, `affected`, `global`, and the exact `reasons` strings, so keep the
"closest changed dependency" semantics for `depends on X`. Ownership rules must keep working:
nested packages, sibling directories with a shared prefix (`packages/ui` vs `packages/ui-kit`),
root-level files, and global dependencies.

Be ready to state the before/after complexity in terms of F (changed files), P (packages) and
E (dependency edges).

## Constraints
- No caching across calls (each CI run is a fresh process).
- Keep the public function signatures.
