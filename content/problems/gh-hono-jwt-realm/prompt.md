# Configurable realm for JWT challenges

This is **Hono**, the small web framework for Web-standard runtimes. When JWT authentication
fails, Hono answers `401` with a challenge like:

```
WWW-Authenticate: Bearer realm="http://localhost/auth/page?a=1",error="invalid_request",error_description="no authorization included in request"
```

Two complaints from users (honojs/hono#4989):

1. The `realm` is the full request URL. RFC 6750 says the realm names a *protection space*. It
   should be stable, not change with every path and query string. Our bearer-auth middleware
   already lets you set it; the JWT middlewares give you no way to.
2. Values are interpolated into a quoted-string without escaping. A `"` inside them cuts the
   header short.

## The ask

- Add an optional `realm?: string` option to **both** JWT-based auth middlewares: the one that
  verifies with a secret (`jwt`) and the one that verifies against a key set (`jwk`).
- Every 401 challenge those middlewares produce (missing token, malformed header, failed
  verification) uses the configured realm.
- Without `realm`, behavior is **unchanged**: the realm is still the request URL.
- Escape `"` in the realm and in `error_description`, the same way the rest of the codebase
  already does for this header.

## Acceptance criteria

```ts
app.use('/auth/*', jwt({ secret: 'a-secret', alg: 'HS256', realm: 'my "quoted" api' }))
// GET /auth/page (no token) ->
// WWW-Authenticate: Bearer realm="my \"quoted\" api",error="invalid_request",error_description="no authorization included in request"
```

Document the option in the middlewares' JSDoc.

## Non-goals

Changing error codes, status text, or the exceptions thrown. Changing bearer-auth.
