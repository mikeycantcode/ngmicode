## Intended approach
Systematically enumerate the routes (`app.ts` → `ROUTES`, `api/handlers/*`). Check
each one against three questions: does it load resources via `loadOwned*`? Is its
scope the one in the README table? Does any input override the principal's tenant?
Then review `handlers/common.ts#idempotent`. The four injected issues, by severity:
1. **Tenant spoofing on `POST /journal/entries`**: `body.tenantId` overrides the
   principal. Any `journal:write` key can move money between another tenant's
   accounts. The domain's tenant check is defeated, because the draft *claims* to be
   that tenant. Fix: always use `c.principal.tenantId`.
2. **IDOR on `/accounts/:id/balance` and `/accounts/:id/statement`**: they skip
   `loadOwnedAccount`. Any read key can read any tenant's balances and full transaction
   history. The "hot path" comment is a red herring: `loadOwnedAccount` costs one map lookup.
3. **Idempotency keys scoped by path instead of tenant**: tenant B replaying
   tenant A's key and body on `/payments` gets A's stored payment response (data leak).
   Different bodies get a confusing 422. Fix: scope by `principal.tenantId`.
   Including the path *as well* is fine.
4. **Wrong scope on reverse**: `accounts:write` instead of `journal:write` (README).
   A key meant only to open accounts can reverse ledger entries.

## Key files
- `src/api/handlers/journal.ts`, `src/api/handlers/accounts.ts`, `src/api/handlers/common.ts`
- `src/api/auth.ts`, `src/api/router.ts`, `src/app.ts` (`ROUTES`)
- `README.md` scope table

## Traps
- Stopping after the first, obvious IDOR. There are four distinct issues, spread
  across three files.
- "Fixing" isolation by returning 403 for cross-tenant access. The spec says 404.
- Fixing idempotency by dropping the path rather than adding the tenant, or adding
  the tenant to the fingerprint (not the key scope). B then gets 422 conflicts
  on A's keys.
- Adding tenant checks in the service layer and changing signatures (out of scope).
- Trusting the comments (OPS-311, hot path) as justification.

## Strong signals
- Asks the agent for a route × (ownership, scope, tenant source) table before fixing anything.
- Writes attack-style tests with two tenants and two keys.
- Checks the README scope table against the route table.
- Mentions defense in depth (e.g. the service should also reject drafts whose tenant ≠ caller), even if out of scope.

## Weak signals
- "Review the API for security issues" with no structure. Accepts a generic list (rate limiting, HTTPS).
- Fixes only what the agent happens to find. No cross-tenant tests.

## Follow-up questions
- OPS-311 support tooling really does need to post on behalf of tenants. How would you design that safely?
- How would you stop this class of bug from coming back (lint rule, router-level ownership, typed tenant context)?
- Is returning 404 for another tenant's resource enough to prevent enumeration? What about timing, or the id format?
- What should the audit log record for a rejected cross-tenant attempt?
