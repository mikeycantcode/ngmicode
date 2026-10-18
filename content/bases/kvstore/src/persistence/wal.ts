// Write-ahead log. In production builds this was an append-only file; in the
// embeddable build it is an in-memory array of encoded entries that the host
// can persist however it likes (store.wal.entries).
//
// What gets logged is decided by the dispatcher: every "write" command that
// actually changed the keyspace, in its *propagated* form (see
// CommandContext.rewrite), plus a DEL for every key removed by expiry or
// eviction. Replaying the log on an empty store at any later time must
// reproduce the same keyspace.

import { encodeCommand } from "./codec";

export class WriteAheadLog {
  readonly entries: string[] = [];
  private suspended = 0;

  get length(): number {
    return this.entries.length;
  }

  get isSuspended(): boolean {
    return this.suspended > 0;
  }

  append(argv: string[]): void {
    if (this.suspended > 0) return;
    this.entries.push(encodeCommand(argv));
  }

  appendMany(argvs: string[][]): void {
    for (const argv of argvs) this.append(argv);
  }

  /** Inserts an entry at a position (used to wrap EXEC'd writes in MULTI). */
  insertAt(index: number, argv: string[]): void {
    if (this.suspended > 0) return;
    this.entries.splice(index, 0, encodeCommand(argv));
  }

  /** Runs fn with appends disabled (replay, snapshot load). Re-entrant. */
  suspend<T>(fn: () => T): T {
    this.suspended++;
    try {
      return fn();
    } finally {
      this.suspended--;
    }
  }

  /** Replaces the whole log (compaction). */
  reset(entries: string[] = []): void {
    this.entries.length = 0;
    this.entries.push(...entries);
  }

  /** The log as one string, as it would appear on disk. */
  toString(): string {
    return this.entries.join("");
  }
}
