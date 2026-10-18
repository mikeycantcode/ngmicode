# Blocking pops (BLPOP)

Our job runner uses `kvstore` lists as work queues. Today, workers poll with
`LPOP` in a loop, which burns CPU and adds latency. We want Redis's blocking
pop:

```
BLPOP key [key ...] timeout
```

Hosts already have an async entry point, `session.send(...)`, which returns a
`Promise<Reply>`. Blocking only makes sense there.

You're working with a weaker agent that loses context quickly. Break the
work down and keep it on track.

## Behavior

- **Immediate.** If any listed key holds a non-empty list, pop the head of the
  *first* such key (in argument order). The reply is `[key, value]`.
- **Blocking.** Otherwise, the promise from `send` stays pending. It resolves
  to `[key, value]` when another client pushes (`LPUSH`/`RPUSH`, including
  inside `MULTI`/`EXEC`) to one of the keys. Clients are woken **after** the
  pushing command, or the whole `EXEC`, has completed.
- **Fairness.** Clients blocked on the same key are served first-come
  first-served, one element each. `RPUSH q a b` with two blocked clients
  gives `a` to the client that blocked first and `b` to the other.
- **Timeout** is in seconds, decimals allowed (`0.5`). `0` means wait forever.
  When it elapses, resolve `null`. A client that timed out never consumes an
  element later. Timers must use the store's injected clock (tests use
  `ManualClock`).
- **Errors.** A non-numeric timeout returns `ERR timeout is not a float or out of range`.
  A negative timeout returns `ERR timeout is negative`. A listed key of the
  wrong type returns the standard WRONGTYPE error. Errors are returned
  immediately; the client never blocks.
- **Non-blocking contexts.** Through the synchronous `session.exec(...)`, or
  when queued inside `MULTI`, BLPOP never blocks. It behaves like an `LPOP`
  across the keys and returns `null` if all are empty.
- Closing a session (`session.close()`) resolves its pending BLPOP with `null`
  and consumes nothing.

## Durability

Whatever a blocked client receives must be reflected in the WAL, so that
restoring from the log gives the same lists, with the element gone. The log
must replay cleanly.

## Out of scope

`BRPOP`, `BLMOVE`, `BZPOPMIN`.
