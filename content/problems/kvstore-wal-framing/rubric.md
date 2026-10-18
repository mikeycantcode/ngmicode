## Intended approach
- `persistence/codec.ts`: add `encodeEntry(argv)` → `"#2 " + crc32Hex(payload) + " " + payload`.
  Make `decodeCommand` detect the `#2 ` prefix, validate the header (`/^#2 [0-9a-f]{8} /`) and
  the checksum, then decode the payload. Bare entries decode as before (v1).
- `persistence/wal.ts`: `append` and `insertAt` (MULTI wrapping) use `encodeEntry`.
- `store.ts`: `compact()` uses `encodeEntry`. `replay()` returns the report. `restore()` stores
  `recovery` and resets the WAL to `entries.slice(0, durableLength)`.
- `persistence/replay.ts`: catch `CorruptLogError` per entry. In strict mode, rethrow. Otherwise
  record `truncatedAt` and stop. Track the index of an open `MULTI` (cleared on EXEC/DISCARD) to
  compute `durableLength`. Count `legacy`.
- Update the visible test that asserted `replay()` returned a number.

## Key files
- `src/persistence/codec.ts`, `wal.ts`, `replay.ts`, `snapshot.ts` (reference: snapshots already use `crc32Hex`)
- `src/store.ts` (`replay`, `restore`, `compact`)
- `src/util/checksum.ts`
- `src/commands/transactions.ts`: explains why MULTI/EXEC appear in the WAL.

## Traps
- **Second writer.** `compact()` builds entries with `encodeCommand` directly, bypassing the
  WAL's append path. So does `insertAt` for the MULTI wrapper. Hidden test 1 checks that every
  entry is framed after EXEC and after BGREWRITEAOF.
- **Torn transaction.** Keeping `entries.slice(0, truncatedAt)` leaves a dangling `MULTI`. The
  next writes append after it, and the *next* restore queues them inside the never-closed
  transaction and silently drops them. Hidden test 4.
- **Swallowing ReplayError.** Treating every replay failure as "corruption" hides real bugs.
  Hidden test 3 checks that strict mode throws `CorruptLogError` with `.index`. The rubric
  rewards keeping `ReplayError` loud.
- Reimplementing CRC-32 instead of reusing `util/checksum.ts`.
- Breaking `decodeCommand` for v1, or making it ignore checksums.

## Strong signals
- The candidate states the API contract (report fields, strict vs default) to the agent up front
  and asks it to list every place that produces WAL entries.
- The candidate reasons about "safe to append to" and finds the dangling-MULTI problem before
  the tests do.
- Backward compatibility is tested explicitly with a mixed v1/v2 log.
- The candidate updates the visible tests deliberately and can explain the change.

## Weak signals
- The candidate adds a checksum only in `append` and declares done.
- Silently skipping corrupt entries and continuing, which replays a log with a hole in the middle.
- No test that corrupts a byte.

## Follow-up questions
- Why stop at the first corrupt entry instead of skipping it and continuing? When would skipping be catastrophic?
- CRC-32 detects accidental corruption. What would you use against a malicious edit of the log?
- How would you version the format again (v3) without another flag day? What does the reader do with `#3`?
- A crash can tear an entry, but can it also leave a *valid-looking* partial entry? How does framing with a length or checksum close that hole?
- Should a corrupt tail be truncated on disk automatically, or kept for forensics? Who decides?
