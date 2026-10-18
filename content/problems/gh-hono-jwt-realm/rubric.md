## Intended approach
Find where the challenge is built: both `src/middleware/jwt/jwt.ts` and
`src/middleware/jwk/jwk.ts` carry their own private copy of `unauthorizedResponse()`, each
with a hard-coded `realm="${ctx.req.url}"`. The merged PR (honojs/hono#5141): add
`realm?: string` to both option types, pass `realm: options.realm` at **every** call site
(3 per file: no-token/cookie path, malformed `Authorization` header, verification failure),
and in `unauthorizedResponse` compute
`(opts.realm ?? opts.ctx.req.url).replace(/"/g, '\\"')` and escape `errDescription` the same
way. The escaping mirrors `src/middleware/bearer-auth/index.ts`. Add JSDoc `@param` lines.

## Key files
- `src/middleware/jwt/jwt.ts`, `src/middleware/jwk/jwk.ts`
- `src/middleware/bearer-auth/index.ts` (existing `realm` option and escaping convention)
- `src/middleware/jwt/index.test.ts` (existing assertions on the default header format)

## Traps
- **Second code path**: fixing `jwt` and forgetting `jwk`, which has a duplicated
  `unauthorizedResponse()`. Hidden tests cover both.
- **Missing a call site**: the realm must reach the invalid-token (verification failure)
  response too, not only the missing-token one. Hidden tests check both.
- **Default regression**: `realm ?? url` vs `realm || url` (both pass tests; discuss empty
  string) — but replacing the default with `""` (bearer-auth's default) breaks backward compat.
- **Escaping only the realm**, not `error_description`; or escaping the URL default differently.
- Changing bearer-auth or the header's parameter order (`realm`, `error`, `error_description`).

## Strong signals
- Searches for every `WWW-Authenticate` producer before editing, and notices the duplicate.
- Points the agent at bearer-auth's escaping so the codebase stays consistent.
- Considers extracting a shared helper, and makes a deliberate call (the PR kept duplication; either is fine if justified).
- Adds tests for both middlewares, both failure paths, the default, and a quoted realm.

## Weak signals
- Only edits the file the agent found first.
- No test for the default realm (backward compatibility).
- Lets the agent "fix" the realm default to something new.

## Follow-up questions
- Should `\` also be escaped in a quoted-string? What does RFC 9110 say, and what would an attacker do with it?
- Would you merge the two `unauthorizedResponse` copies? What are the costs (bundle size, coupling) and benefits?
- `realm ?? url` vs `realm || url`: what is the observable difference, and which is right?
- Reflecting the request URL into a response header: are there any security concerns with the default?
