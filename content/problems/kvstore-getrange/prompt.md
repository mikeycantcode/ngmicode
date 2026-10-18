# GETRANGE with exact Redis semantics

A client library we embed `kvstore` behind calls `GETRANGE` and fails with
`ERR unknown command 'GETRANGE'`. Add the command.

Your instructions to the agent are graded for precision. You are scored on how precisely you specify the behavior.

## The command

```
GETRANGE key start end
```

It returns the substring of the string at `key` between `start` and `end`.
**Both ends are inclusive.** Indexes are 0-based, and negative indexes count
from the end (`-1` is the last character).

String commands live in `src/commands/strings.ts`. Look at how the existing
commands there are declared and registered.

## Exact rules

Let `len` be the length of the stored string (a missing key behaves like `""`).
Apply these steps in order:

1. If `start < 0` **and** `end < 0` **and** `start > end`, return `""`.
2. If `start < 0`, set `start = len + start`. If `end < 0`, set `end = len + end`.
3. If `start` is still negative, set it to `0`. If `end` is still negative, set it to `0`.
4. If `end >= len`, set `end = len - 1`.
5. If `start > end` or `len == 0`, return `""`. Otherwise return the characters `start..end` inclusive.

These rules are **not** the same as `LRANGE` / `normalizeRange`. For example,
with `"Hello World"` stored, `GETRANGE k 0 -100` returns `"H"`, while the same
indexes in LRANGE would give an empty result.

| Stored value | Command | Reply |
|---|---|---|
| `"Hello World"` | `GETRANGE k 0 4` | `"Hello"` |
| `"Hello World"` | `GETRANGE k -5 -1` | `"World"` |
| `"Hello World"` | `GETRANGE k 6 1000` | `"World"` |
| `"Hello World"` | `GETRANGE k 0 -100` | `"H"` |
| `"Hello World"` | `GETRANGE k -1 -5` | `""` |
| `"Hello World"` | `GETRANGE k 5 2` | `""` |
| *(missing)* | `GETRANGE nope 0 -1` | `""` (empty string, **not** nil) |

## Errors

- If `start` or `end` is not an integer, reply `ERR value is not an integer or out of range`.
  This happens even when the key is missing. Use the existing integer parser.
- If the key holds a non-string value, reply with the standard `WRONGTYPE ...` error.
- If the argument count is wrong, reply with the standard arity error
  (`ERR wrong number of arguments for 'getrange' command`).

## Must also hold

- GETRANGE is a **read-only** command. It must never be written to the WAL,
  and it must never trigger eviction.
- It counts toward `keyspace_hits` / `keyspace_misses` in `INFO` exactly like `GET`.
- Inside `MULTI` it is queued and runs on `EXEC` like any other command.

## Out of scope

`SETRANGE`, `SUBSTR` and any other new commands.
