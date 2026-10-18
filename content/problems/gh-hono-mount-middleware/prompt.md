# Mount middleware

This is **Hono**, the small web framework for Web-standard runtimes. `app.mount(path, handler,
options?)` lets you plug an app built with another framework (itty-router, a raw `fetch`
handler, another Hono app) into a Hono app under a path prefix.

The maintainers want `mount` out of the core `Hono` class: it is "fat" relative to the other
core methods and costs bundle size for everyone. The plan is to ship it as a **middleware**,
deprecate `app.mount()` now, and remove it in the next major.

## The ask

Add `mount()` as a new built-in middleware, following the layout of the existing ones
(`import { mount } from 'hono/mount'`, i.e. `src/middleware/mount/index.ts`):

```ts
const app = new Hono()
app.all('/itty-router/*', mount(ittyRouter.handle))
// GET /itty-router/hello -> ittyRouter sees GET /hello
```

Signature: `mount(applicationHandler, options?)`, where `options` takes the **same forms**
`app.mount()` accepts today. Mark `app.mount()` as deprecated in favor of it (keep it working).

## Acceptance criteria

- The mounted handler receives a request whose path has the mount prefix stripped (`/` when
  nothing is left). Query string, method, headers and body are preserved.
- There is no `path` argument any more. The prefix comes from the route the middleware is
  registered on, and it must respect a Hono `basePath()` (`api.basePath('/api')` +
  `api.all('/x/*', mount(h))` strips `/api/x`). Mounting on `/*` strips nothing.
- Prefixes with non-ASCII characters (e.g. `/api/é/*`, requested as `/api/%C3%A9/hello`) strip correctly.
- Extra handler arguments behave like `app.mount()`: by default `(request, c.env, executionCtx)`
  (when there is no execution context, do not throw); an option handler's return value is passed
  through, and an array return value is spread.
- `replaceRequest` (a function, or `false` for "pass the original request through") works as before.
- If the mounted handler returns nothing, fall through to the rest of the Hono app. That makes
  `app.use('/legacy/*', mount(legacy))` a valid pattern.
- Outer Hono middleware still runs around the mounted app (e.g. it can add headers).

## Non-goals

Removing `app.mount()`. Package export maps and docs.
