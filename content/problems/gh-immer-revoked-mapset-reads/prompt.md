# Revocation for Map and Set drafts

Once `produce` or `finishDraft` returns, its drafts are **revoked**. Any later use
must fail loudly with Immer's revoked-proxy error ("Cannot use a proxy that has
been revoked. Did you pass an object from inside an immer function to an async
process?"). That error is how users find drafts that leaked into a `setTimeout`
or a promise.

Object and array drafts get this for free from `Proxy.revocable`. Map and Set
drafts (`enableMapSet()`) work differently, and today some of their reads keep
working after revocation, returning stale data:

```js
enableMapSet()
let draft
produce({map: new Map([["a", 1]])}, d => { draft = d.map })

draft.get("a")    // throws, good
draft.set("a", 2) // throws, good
draft.has("a")    // true   <- should throw
draft.size        // 1      <- should throw
```

## The ask

Make revocation consistent: **every** public read and write on a revoked Map or
Set draft throws the revoked-proxy error.

## Acceptance criteria

- On a revoked Map draft: `has`, `size`, `keys`, `values`, `entries`, `forEach`,
  `get`, and iteration all throw the revoked-proxy error at call time.
- On a revoked Set draft: `size` throws, alongside the methods that already do.
- `forEach` throws even when the Map is empty.
- Inside a live recipe, nothing changes: same results, same performance.
- In production builds the error is the minified error number for the same message.

## Non-goals

Changing how object or array drafts revoke. Adding a new error code.
