// Rebuilds a keyspace by re-executing WAL entries through the dispatcher.
//
// Replay runs on a dedicated internal session with `replaying` set, which
// means: nothing is appended to the WAL and no eviction runs. Expiry is frozen
// while loading (Keyspace.loading); a key whose deadline passed during the
// downtime is reaped normally once replay is done.
//
// Corruption handling: by default replay stops at the first entry that fails
// to decode (bad frame, checksum mismatch, torn write) and reports where. In
// strict mode it throws CorruptLogError instead.

import { CorruptLogError } from "../errors";
import { ErrorReply } from "../types";
import type { Store } from "../store";
import { decodeCommand, isFramed } from "./codec";

export class ReplayError extends Error {
  constructor(
    message: string,
    readonly index: number,
  ) {
    super(message);
    this.name = "ReplayError";
  }
}

export interface ReplayOptions {
  /** Throw CorruptLogError on the first corrupt entry instead of stopping there. */
  strict?: boolean;
}

export interface ReplayReport {
  /** Entries decoded and executed (everything before truncatedAt). */
  applied: number;
  /** How many of the applied entries were legacy v1 (unframed). */
  legacy: number;
  /** Index of the first corrupt entry, or null if the whole log was valid. */
  truncatedAt: number | null;
  /**
   * Length of the longest applied prefix that ends on a transaction boundary.
   * Smaller than `applied` when the log ends inside MULTI ... (no EXEC).
   * This is the prefix that is safe to keep appending to.
   */
  durableLength: number;
}

/**
 * Applies `entries` to `store` in order. Throws ReplayError when an entry
 * decodes but the command fails (the log and the code disagree — never
 * silently skip that).
 */
export function replayEntries(store: Store, entries: string[], opts: ReplayOptions = {}): ReplayReport {
  const session = store.replaySession();
  let applied = 0;
  let legacy = 0;
  let truncatedAt: number | null = null;
  let openMulti: number | null = null;

  const wasLoading = store.ks.loading;
  store.ks.loading = true;
  try {
    store.wal.suspend(() => {
      for (let i = 0; i < entries.length; i++) {
        let argv: string[];
        try {
          argv = decodeCommand(entries[i], i);
        } catch (e) {
          if (!(e instanceof CorruptLogError) || opts.strict) throw e;
          truncatedAt = i;
          return;
        }
        const reply = session.exec(argv);
        if (reply instanceof ErrorReply) {
          throw new ReplayError(`WAL entry #${i} (${argv[0]}) failed on replay: ${reply.message}`, i);
        }
        const name = argv[0].toUpperCase();
        if (name === "MULTI") openMulti = i;
        else if (name === "EXEC" || name === "DISCARD") openMulti = null;
        if (!isFramed(entries[i])) legacy++;
        applied++;
      }
    });
  } finally {
    store.ks.loading = wasLoading;
  }
  if (session.inMulti) {
    // A MULTI without its EXEC means the log was cut mid-transaction: the
    // transaction never committed, so dropping it is correct.
    session.discardMulti();
  }
  return { applied, legacy, truncatedAt, durableLength: openMulti ?? applied };
}

export { CorruptLogError };
