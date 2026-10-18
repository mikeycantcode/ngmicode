# Checksummed WAL with torn-tail recovery

Hosts persist `store.wal.entries` to disk. After a power loss, one customer's
log ended with half an entry, and `Store.restore` threw, so the service
refused to start. Another customer's log had a single flipped byte in the
middle that replayed "successfully" as a different value. Nobody noticed for
a week.

We need a WAL format that detects corruption and a recovery API that does the
right thing with it.

## 1. Entry format v2

Every entry the engine writes from now on uses this frame:

```
#2 <crc> <payload>
```

- `<payload>` is exactly today's entry encoding (the RESP-like command).
- `<crc>` is the CRC-32 of the payload as 8 lowercase hex digits. The codebase
  already has a CRC-32 implementation; use it.
- Separators are single spaces.

Existing logs are full of **v1** entries (bare payloads). They must keep
replaying, and a log may mix v1 and v2 entries.

`decodeCommand(entry)` is used by external tooling. It must keep working for
both formats and must throw `CorruptLogError` on a bad v2 checksum.

## 2. Replay API

`store.replay(entries, opts?)` now returns a report instead of a number:

```ts
interface ReplayReport {
  applied: number;          // entries decoded and executed
  legacy: number;           // how many of those were v1
  truncatedAt: number | null; // index of the first corrupt entry, or null
  durableLength: number;    // see below
}
```

- **Default:** replay stops at the first entry that cannot be decoded (bad
  frame, checksum mismatch, malformed or truncated payload). Entries before it
  are applied and entries after it are ignored. `truncatedAt` is its index.
- **`{ strict: true }`:** throw `CorruptLogError` (with `.index` set) instead.
- A decodable entry whose command fails must still throw `ReplayError`, as it
  does today. That is a code/log mismatch, not corruption, and must never be
  skipped.

## 3. Restore

`Store.restore(opts, { wal })` must recover instead of refusing to start:

- It replays in default (non-strict) mode and exposes the report as `store.recovery`.
- The restored store's WAL keeps **only the prefix that is safe to append to**.
  That excludes the corrupt tail, and it also excludes any transaction that
  was cut off: a `MULTI` whose `EXEC` never made it to the log, along with
  everything after that `MULTI`. Report that length as `durableLength`. It
  equals `applied` when the log ends on a transaction boundary.

## Also

- Everything the engine writes to the WAL must be v2, including entries
  written by compaction (`BGREWRITEAOF`).
- Update the existing tests whose expectations change. Explain which ones and why.
