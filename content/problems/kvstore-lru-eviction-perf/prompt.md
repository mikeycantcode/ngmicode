# Eviction falls over at scale

A customer runs `kvstore` as a bounded cache with
`maxmemory-policy allkeys-lru`. Under load tests, writes are fast until the
cache fills up. After that, throughput collapses. With about 20k live keys, a
single `SET` takes milliseconds instead of microseconds, and it keeps getting
worse as the cache grows.

Reads are fine. Writes while under the memory limit are fine. Only writes once
eviction is active are slow.

## Your task

Find out why, and fix it. You have a weaker agent with a short memory. Point
it at the right code and check its work carefully.

## Acceptance criteria

- With 20,000 live keys at the memory limit, another 20,000 `SET`s (each one
  forcing an eviction) complete in about a second or less in the test sandbox.
- LRU semantics are unchanged. The victim is always the least recently
  *accessed* key, and both reads and writes count as access.
- `INFO used_memory` stays **exact**. It must always equal the sum of the
  per-key size estimates in `src/core/sizeof.ts`, after any command,
  including in-place modifications of lists, hashes and sorted sets, renames,
  expiry and FLUSHALL. The comment in the code explains why it is computed the
  way it is. Don't reintroduce the drift it describes.
- All existing tests pass.

## Notes

- Explain the complexity before and after for one `SET` under eviction.
- `volatile-lru` doesn't need to be O(1), but it must stay correct.
