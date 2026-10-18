## Intended approach
Read 2–3 existing response-transforming middlewares (`trailing-slash`, `etag`, `pretty-json`)
for the shape: `await next()`, then inspect/replace `c.res`. Discover that Hono exposes
`app.routes` (`{ method, path, basePath, handler }`) and the `helper/route` helpers
(`matchedRoutes`, `basePath`, `routePath`). The merged PR (honojs/hono#5132):
1. After `next()`, bail unless `c.res.status === 404` and there is no `c.error`.
2. Lazily (first 404) build a `TrieRouter<string[]>` from `app.routes`, keyed by path, mapping
   to the set of methods. Skip `ALL` (that is what `app.use`/`app.all` register) and explicit
   `HEAD`. Add `HEAD` right after `GET`.
3. Match the request path against that router; union the methods. If none, or the request
   method is in the set, keep the 404.
4. When the middleware lives in a sub-app mounted with `app.route()`, strip the mount prefix
   from `c.req.path` (computed from `basePath(c, routeIndex)` minus the sub-app's own basePath).
5. Delete stale `Allow`/`Content-Length` and set `c.res = onMethodNotAllowed?.(c, methods) ??
   c.text('Method Not Allowed', 405, { Allow })`.

## Key files
- `src/middleware/method-not-allowed/index.ts` (new)
- `src/hono-base.ts` (`routes`, `#addRoute`, `route()`), `src/helper/route/index.ts`
- `src/router/trie-router` (reuse a router instead of hand-rolled path matching)
- Peer middleware for conventions: `src/middleware/trailing-slash/index.ts`, `src/middleware/etag/index.ts`

## Traps
- **Re-implementing path matching** with string compare or a hand-rolled regex: misses
  `:params`, wildcards, and overlapping routes. Reusing a Hono router is the clean answer.
- **Counting `ALL` routes**: every `app.use()` is an `ALL` route; including it makes every path
  "exist" and adds `ALL` to `Allow`.
- **Forgetting HEAD** or adding it in the wrong place; or duplicating methods when two
  routes (`/users/:id`, `/users/me`) match the same path.
- **Throwing `HTTPException(405)`**: triggers `onError`, and outer middleware never see a
  normal 405. The prompt says not to.
- **Overriding intentional 404s** from a handler registered for the request method.
- **Sub-app installation**: the middleware inside `api.basePath('/v1')` mounted at `/api` sees
  `c.req.path === '/api/v1/resource'`, but `api.routes` say `/v1/resource`. Naive matching 404s.
- **Rebuilding the method index per request** (perf) or building it at construction time
  (routes are registered *after* `app.use(methodNotAllowed({ app }))`, so it would be empty).

## Strong signals
- Has the agent survey `app.routes` and the route helpers before writing code.
- Spots the "routes registered after the middleware" ordering problem and asks for lazy init.
- Writes a test matrix: 405 vs 404, HEAD/GET, overlapping params, sub-app both ways, custom handler.
- Runs the existing suite to confirm default behavior is untouched (opt-in).

## Weak signals
- Accepts an agent patch to `hono-base.ts` that changes 404 handling globally.
- Only tests the single happy path from the brief.
- Lets the agent throw an exception "because that's how 401s work".

## Follow-up questions
- Your method index is cached on first use. What happens if routes are added after the first request? Is that acceptable?
- Why did we leave `ALL` routes out of `Allow`? What would a user registering `app.all('/x', ...)` expect?
- How should this interact with `OPTIONS` and CORS preflight?
- Some teams prefer 404 for unsupported methods for security reasons. What is the argument, and how does opt-in serve both?
- What does the cost look like per request on the 404 path, and could it be a DoS vector?
