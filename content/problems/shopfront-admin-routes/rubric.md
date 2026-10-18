## Intended approach
Three injected issues:
1. **Mass assignment**: `POST /accounts/register` passes the raw body to `AccountService.register`,
   which now honors `input.role` ("ops console" comment). Fix both layers: the route builds an
   explicit `{ email, password, name, region }`, and `register()` always creates a `customer`.
   `createAdmin` already exists for internal use.
2. **IDOR**: `loadVisibleOrder` in `http/routes/orders.ts` lost its ownership check. Restore
   `user.role !== "admin" && order.customerId !== user.id → NotFoundError`. `/pay` happens to
   re-check ownership, but `GET /orders/:id` does not.
3. **Unguarded admin route**: `POST /admin/inventory/:sku/adjust` has no `admin` middleware.
   The tester didn't report it. Finding it requires auditing every `/admin` route (the README says
   every one must use `requireRole("admin")`). `router.describe()` makes a systematic test easy.
With a weak agent, the candidate should split this into small, explicit steps: show it the
exact files, ask it to list every route and its middleware, then fix one issue at a time.

## Key files
- `src/http/routes/accounts.ts`, `src/accounts/account-service.ts` (`register`, `RegisterInput.role`)
- `src/http/routes/orders.ts` (`loadVisibleOrder`)
- `src/http/routes/admin.ts` (adjust route)
- `src/http/middleware.ts` (`requireRole`, `validateBody` with `strict` option)
- README "Auth"

## Traps
- Fixing only the two reported endpoints and missing the unguarded `adjust` route.
- Rejecting `role` with a 400 instead of ignoring it (the spec says 201 + customer).
- Fixing mass assignment only in the route (or only in the service). Defense in depth means both.
- Returning 403 for other customers' orders, which leaks existence. The spec requires an identical 404.
- Breaking admin access to orders by checking `customerId === user.id` without the admin exception.
- The weak agent "fixes" by adding `requireRole("admin")` to customer routes such as `/orders/:id`.

## Strong signals
- Treats the findings as bug classes and audits systematically (lists all routes plus guards, or writes a test that walks `router.describe()`).
- Writes regression tests for each finding before or with the fix.
- Feeds the weak agent precise context (file paths, the README auth section) and checks each diff.
- Mentions related hardening: strict body validation on register, `createAdmin` not reachable over HTTP.

## Weak signals
- Accepts the agent's "fixed both findings" without checking other admin routes.
- No tests, or only manual reasoning.
- Lets the agent refactor auth broadly under time pressure.

## Follow-up questions
- How would you prevent a future admin route from shipping without a guard? (router-level prefix guard, deny-by-default, lint/test)
- Why 404 instead of 403 for other people's orders? When would 403 be acceptable?
- The ops console needs to create staff accounts. How should that work safely?
- What other mass-assignment risks exist in this codebase (e.g. `PUT /admin/products/:id`)?
