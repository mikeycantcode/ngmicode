## Intended approach
Start from `app.mount()` in `src/hono-base.ts`; it already has all the option parsing
(`MountOptions`, `optionHandler`, `replaceRequest`, `false` shorthand, array spreading, the
`executionCtx` try/catch). The new middleware moves that logic into
`src/middleware/mount/index.ts` and replaces the one thing that depended on the `path`
argument: the prefix length. The merged PR (honojs/hono#5221) derives the prefix at request
time from `routePath(c)` (helper/route), which already includes the app's `basePath`, strips a
trailing `/*`, then builds `new URL(c.req.raw.url)` with `pathname = c.req.path.slice(prefix.length) || '/'`
and `new Request(url, c.req.raw)`. If the handler returns a falsy value, `await next()`.
Add `@deprecated` to `app.mount()`'s JSDoc. Export the option types.

## Key files
- `src/hono-base.ts` (`mount()`, the source of truth for behavior)
- `src/helper/route/index.ts` (`routePath`, `basePath`)
- `src/request.ts` (`c.req.path` is the *decoded* path; `routePath` getter)
- `src/middleware/mount/index.ts` (new); any existing middleware for file layout and JSDoc style

## Traps
- **Using the raw URL pathname for slicing**: the route pattern is decoded (`/api/é`), the raw
  URL is encoded (`/api/%C3%A9`). Slicing by the decoded prefix length on the encoded path
  corrupts the result. `c.req.path` (decoded) is the right input.
- **Ignoring `basePath()`**: computing the prefix from a captured argument or from
  `c.req.routePath` without the base path. `routePath(c)` already merges it.
- **Mounting on `/*`** must strip nothing (prefix `''` after removing `/*`), not `/`.
- **Dropping fall-through**: returning `undefined` from the middleware instead of `await next()`
  breaks the `app.use()` pattern and the app's `notFound`.
- **Breaking `executionCtx`**: accessing `c.executionCtx` throws outside Workers; it must be guarded.
- **Copy-paste drift**: re-implementing option parsing by hand and forgetting `replaceRequest: false`
  or array spreading. Strong candidates extract or mirror the existing code exactly.
- Deleting or changing `app.mount()` behavior (non-goal; must keep working).

## Strong signals
- First asks the agent to explain how `app.mount()` computes the prefix and what changes without a `path` argument.
- Checks what `routePath(c)` returns inside a middleware registered with `app.all` vs `app.use`, and with `basePath`.
- Writes tests for: basePath, `/*` mount, encoded prefix, fall-through, env/executionCtx forwarding.
- Runs the existing suite to confirm `app.mount()` still passes.

## Weak signals
- Accepts a version that takes `mount(path, handler)` (re-introducing the path argument).
- Never tests with an encoded or non-ASCII path.
- Lets the agent refactor `hono-base.ts` heavily (out of scope, risky).

## Follow-up questions
- Why derive the prefix from the matched route at request time instead of at registration time? What does that cost per request?
- What happens if a user registers `mount()` on a route with a parameter, e.g. `/tenants/:id/*`?
- How would you migrate users of `app.mount()` in the next major? Codemod, deprecation warning, or both?
- An encoded slash (`%2F`) appears after the prefix. Should the mounted app see `/a%2Fb` or `/a/b`? Why does it matter for security?
