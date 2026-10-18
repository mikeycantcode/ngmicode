# Pre-launch security review of the partner API

Next week we hand API keys to our first external partners. Each partner is a
**tenant**. Each key belongs to exactly one tenant and carries a set of
**scopes** (see the README). Until now the only callers were our own apps.

Our security lead skimmed the API layer and said: *"I'm fairly sure a partner
can see or move another partner's money, and I'm not convinced scopes mean
what we think they mean."* She didn't have time to dig further.

## The ask

Review the API layer and everything it relies on for tenant isolation,
authorization, and idempotency. Fix every issue you find. You're done when:

- A key can only read or change resources owned by its own tenant. Cross-tenant
  access looks exactly like a missing resource (`404`), never a `403`.
- A key can only call endpoints its scopes allow, as the README's scope table defines.
- Idempotency keys from different tenants never interact. One tenant can never
  receive another tenant's stored response.
- Nothing you change breaks the existing API behavior for legitimate callers.

In your final message, list each issue: what an attacker could do, how you fixed
it, and how you verified it. Rank them by severity.

## Constraints

Keep the fixes minimal. This is a review, not a rewrite. Don't change the
service layer's public signatures.
