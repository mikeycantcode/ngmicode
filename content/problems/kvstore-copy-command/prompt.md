# Add COPY

Product wants "duplicate this cart / this leaderboard / this config blob" in
the admin tool. The backing store is `kvstore`, so we need Redis's `COPY`
command:

```
COPY source destination [REPLACE]
```

## Behavior

- Copies the value stored at `source` to `destination` and returns `1`.
- Returns `0` and does nothing if `source` does not exist, or if
  `destination` already exists and `REPLACE` was not given.
- With `REPLACE`, an existing `destination` is overwritten, whatever its type.
- The copy gets the **same expiry** as the source: the same absolute deadline,
  or none if the source is persistent. When `REPLACE` overwrites a destination
  that had its own TTL, that TTL is gone.
- `COPY k k` returns `ERR source and destination objects are the same`.
- Any other trailing argument returns `ERR syntax error`.
- Works for every value type: string, list, hash and sorted set.

## Production requirements

This is a database, so "works in a unit test" is not enough. The new command
must behave like a first-class write:

- Source and destination are independent afterwards. Changing one must never
  affect the other.
- It survives a restart. Rebuilding a store from the WAL, at any later time,
  must give the same keyspace, including TTLs.
- It respects the memory budget and memory accounting (`maxmemory`, `INFO used_memory`).
- Transactions see it. A client `WATCH`ing the destination must have its `EXEC`
  aborted by a `COPY` onto that key, and `COPY` works inside `MULTI`.
- Expired keys behave as if they do not exist.

## Out of scope

The `DB` option of Redis's `COPY` (this engine has a single database).
