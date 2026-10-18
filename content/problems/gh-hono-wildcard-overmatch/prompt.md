# Wildcard routes match too much

This is **Hono**, the small web framework for Web-standard runtimes. Hono ships several
interchangeable router implementations. Apps can pick one via the `router` option. All of them
are supposed to agree on which routes match a path.

## Bug report

> We switched routers to cut bundle size, and our auth middleware started running on routes it
> should not. `app.use('/admin/*', requireAdmin)` now also guards `/administrators`, and a
> `/assets*` route answers `/asset`. With the default router, neither happens.

## The ask

Find which routers disagree, explain the root cause, and fix it. The agreed semantics:

| Route        | Should match                              | Should NOT match |
|--------------|-------------------------------------------|------------------|
| `/path/*`    | `/path`, `/path/`, `/path/to/file`        | `/pathfoo`       |
| `/assets*`   | `/assets`, `/assets-v2`, `/assets/app.js` | `/asset`         |
| `/a/*/b/*`   | `/a/x/b`, `/a/x/b/c`                      | `/a/x/bz`        |

So a trailing `/*` means "this path, or anything below it". A bare trailing `*` means "this
prefix, followed by anything".

## Expectations

- Every router must behave the same. Do not break routers that are already correct, or other
  route shapes (labels, regex labels, optional params, middle wildcards).
- Add regression coverage that runs against **all** routers, not just one.
- Walk the interviewer through the root cause before you change code.
