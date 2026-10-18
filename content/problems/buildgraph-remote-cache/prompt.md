# Remote cache (RFC-12)

Every CI job and laptop rebuilds what someone else already built. We want a shared
**remote cache** tier behind the existing local cache. The HTTP client is someone else's
job. You own the integration, against this interface (put it wherever it fits the codebase):

```ts
export interface RemoteCache {
  get(hash: string): Promise<CacheEntry | undefined>;
  put(entry: CacheEntry): Promise<void>;
}
```

`runTasks`'s context and `createCli`'s context accept an optional `remoteCache`.

## Behavior

**Lookup** (cacheable tasks, not `--force`): local first. On a local miss, ask the remote.
- Remote hit: restore outputs and replay logs exactly like a local hit, then **backfill the local cache**
  so the next run is a local hit.
- Each task result (and each task in the CLI's structured output) gets
  `cacheSource: "local" | "remote" | null` (null when the task wasn't served from cache).
- If the remote `get` fails, treat it as a miss. A broken remote must never fail a build.

**Upload** (after a cacheable task executes successfully): write the local cache as today, and
upload the entry to the remote.
- Uploads must **not** delay the task's dependents. They start as soon as the task finishes.
- `runTasks` must not resolve until every upload has settled (no work left dangling when the
  process exits).
- A failed upload is a `warn` event (`{ id, message }`), not a failure.

**Config** (`buildgraph.json` and overrides): `"remoteCache": { "read": boolean, "write": boolean }`,
both defaulting to `true`. `read: false` never calls `get`; `write: false` never calls `put`.

**CLI text**: the summary's cache line also shows how many hits came from the remote.

## Out of scope
Auth, the HTTP client, and cache eviction.
