# Security finding: cache restore writes outside the package

From the internal security review:

> CI jobs share the buildgraph cache directory. On a cache hit, buildgraph writes each artifact
> in the entry to `<package dir>/<artifact path>`. An attacker who can write one cache entry
> (a malicious PR whose CI job populates the shared cache, for example) can make a later
> job write anywhere in the checkout. Examples: `../../package.json`, or another package's
> `dist/` via `../ui-kit/dist/index.js`.

Your agent is an older, smaller model. Keep it on track.

## Requirements

1. Restoring a cache entry must **never** write outside the package directory of the task
   being restored. "Outside" includes sibling packages whose directory name starts with the
   same characters.
2. An entry is **rejected as a whole** if any artifact path:
   - resolves outside the package directory after normalization,
   - is absolute (starts with `/`),
   - contains a backslash, or is empty.

   A rejected entry restores **nothing**, not even its valid artifacts.
3. A rejected entry is treated as a **cache miss**. The task executes normally, the run
   succeeds, and the fresh result replaces the bad entry.
4. Emit a `warn` event on the bus: `{ id: <task id>, message }`, where message contains
   `rejected cache entry`.
5. Harmless paths that normalize to somewhere inside the package (`dist/../dist/a.js`) keep working.

## Non-goals
Signing or authenticating cache entries. We'll do that separately; this is defense in depth.
