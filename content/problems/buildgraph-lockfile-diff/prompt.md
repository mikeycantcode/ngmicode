# `install` should report what changed in the lockfile

Reviewers can't read `buildgraph.lock` diffs: keys are requested specs (`react@^18.2.0`), so one
upgrade touches several lines. We want `buildgraph install` to report a **package-level** diff.

Your agent runs in **literal mode**. It does exactly what you say and nothing more. Delegate
precisely.

## Part 1: `src/resolver/lockfile-diff.ts`

```ts
export interface LockfileDiff {
  added: { name: string; version: string }[];
  removed: { name: string; version: string }[];
  changed: { name: string; from: string; to: string }[];
  integrityChanged: { name: string; version: string }[];
}
export function diffLockfiles(prev: Lockfile | null, next: Lockfile): LockfileDiff;
```

Rules:

1. Compare by **package name** and the **set of resolved versions** for that name, taken across
   all lock keys. The specs (`^18.0.0` vs `^18.2.0`) don't matter. A new spec that resolves to an
   already-locked version is not a change.
2. For each name, let *gone* = versions in `prev` but not in `next`, and *new* = versions in
   `next` but not in `prev`. If there is **exactly one** gone and **exactly one** new version, emit
   one `changed` entry `{ name, from, to }`. Otherwise every gone version goes into `removed` and
   every new version goes into `added`.
3. `integrityChanged` lists `{ name, version }` for versions present in both lockfiles whose
   `integrity` differs. (If several keys resolve to the same version, use the entry whose key
   sorts first.)
4. `prev === null` means everything in `next` is `added`.
5. Sorting: every list is sorted by `name` (plain code-unit order), then by `version` using
   **semver precedence** (`4.17.9` before `4.17.10`). `changed` is sorted by `name`.
6. Pure: never mutate the inputs.

## Part 2: wire it into `install`

The `install` command's structured output (`src/cli/commands.ts`) gains a `diff` field: the
result of `diffLockfiles(previousLockfileOrNull, newLockfile)`. Keep every existing field.

## Out of scope
The text output, the lockfile format, and the resolver.
