# `--dry-run` for `build` and `test`

Developers keep asking "why did this rebuild?" and "will CI hit the cache?". We want a dry run
that answers this without doing any work.

Your agent is an older, smaller model with a short memory. Feed it the context it needs.

## The ask

`buildgraph build --dry-run` and `buildgraph test --dry-run` (the other flags, including
`--filter`, keep working) return:

```ts
{
  command: "build" | "test",
  dryRun: true,
  ok: true,
  tasks: Array<{
    id: string;          // "@acme/ui#build"
    hash: string;        // the hash a real run would use right now
    cache: "HIT" | "MISS" | "DISABLED";  // DISABLED = task has cache: false
    dependsOn: string[]; // direct task dependencies, sorted
  }>;
}
```

with `exitCode: 0`. Tasks are listed in the same order a real run lists them. Any reasonable
human-readable `text` is fine.

## Acceptance criteria

- **Nothing runs.** No scripts execute. No files are written or restored. Nothing is written to the cache.
- A dry run right after a successful `build` reports every task as `HIT`, with exactly the
  hashes that `build` just reported.
- After editing a source file in `@acme/ui`, `@acme/ui#build` and every build task downstream
  of it report `MISS`, and unrelated tasks still report `HIT`.
- `--filter` selects the same tasks a real run would.
