# Where do expired keys go?

The platform team graphs `expired_keys` from `INFO` to size a session cache.
Their numbers look wrong. One service sets thousands of short-TTL keys, reads
each key once after it expires, and its dashboard shows `expired_keys` close
to zero. The cache-warmer subscribes to the internal `expired` event
(`store.events.on("expired", ...)`) and misses most expirations too.

You are new to this codebase. Before you change anything, show that you
understand how expiry works.

## Part 1: explain (in the chat, or in a short `NOTES.md`)

Answer briefly and precisely, citing the functions involved:

1. A key has a TTL. In what situations, and through which code path, is it actually removed from the keyspace?
2. What gets written to the WAL when a key expires, and why is it written at all, given that TTLs are already logged?
3. Suppose a key's TTL has passed but nothing has touched the key yet. Does `DBSIZE` count it? Does `GET` return it? Does `SCAN` return it?
4. What *should* `expired_keys` count, and what does it count today?

## Part 2: fix

Make `INFO expired_keys` and the `expired` engine event agree with reality:

- Every key that is removed because its TTL elapsed is counted **exactly once**
  and emits **exactly one** `expired` event, whether it was removed lazily
  (on access by any command) or by the active cycle (`store.tick()`).
- Nothing else changes. That includes the WAL contents, which keys are removed
  and when, and the return value of `tick()`.

## Constraints

- Keep the fix small. This is a code-reading exercise, not a redesign.
- Do not add a second expiry code path.
