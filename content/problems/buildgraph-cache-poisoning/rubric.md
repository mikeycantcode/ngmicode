## Intended approach
Find the restore path: `runner/task-runner.ts` (cache hit branch) -> `cache/outputs.ts`
(`restoreOutputs`, which uses `join(pkgDir, a.path)` with no check). Add a validation step that
checks **every** artifact before writing anything. Reuse `isWithin` from `utils/paths.ts` (it already
handles the `packages/ui` vs `packages/ui-kit` prefix problem). Reject absolute paths, backslashes and
empty paths. In the runner, validate before restoring. On rejection emit `warn` and fall through to
the miss path (emit `cache:miss`, execute, put). Optionally, `restoreOutputs` also throws on unsafe
input as a second guard.

## Key files
- `src/cache/outputs.ts` (`restoreOutputs`)
- `src/runner/task-runner.ts` (hit branch)
- `src/utils/paths.ts` (`join`, `normalize`, `isWithin`)
- `src/core/events.ts` (`warn` event already exists)

## Traps
- **Prefix check without separator**: `target.startsWith(pkgDir)` accepts `packages/ui-kit/...` for `packages/ui`.
- **Checking the raw string** for `..` instead of the normalized result. This rejects the harmless `dist/../dist/a.js`
  and misses odd encodings. Normalize, then check containment.
- **Non-atomic restore**: validating inside the write loop writes the good files before hitting the bad one.
- `join` treats a leading `/` as a plain segment (`packages/ui/etc/passwd`). It looks safe, but the requirement
  says to reject it, because other stores or real filesystems would treat it as absolute.
- Letting `VfsError` from `MemoryFS` (root escape) propagate. The task fails instead of degrading to a miss.
- Treating rejection as a hard failure, which lets an attacker DoS the build.
- The weak agent may "fix" `MemoryFS.write` globally instead. That doesn't protect sibling packages.

## Strong signals
- Writes exploit tests first (sibling, root, absolute, backslash) and keeps them as regression tests.
- Explicitly asks for validate-all-then-write.
- Reuses `isWithin` and explains why it's correct.
- Considers the write side too: could `collectOutputs` ever capture something outside? (No, it lists under the package dir.)

## Weak signals
- Blocklist of strings (`"../"`).
- Doesn't test the sibling-prefix case.
- Accepts a fix in only one of the two spots (validation without the miss fallback, or vice versa).

## Follow-up questions
- What else in a cache entry is attacker-controlled? (Logs are replayed to the terminal: escape sequences. `taskId`/`hash` mismatch.)
- How would you authenticate entries (HMAC with a CI secret)? Who holds the key, and what about fork PRs?
- Symlinks: if the real filesystem had them, how would your check change?
- Should a rejected entry be deleted from the shared cache, or just overwritten? Any race?
