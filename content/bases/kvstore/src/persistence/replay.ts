// Rebuilds a keyspace by re-executing WAL entries through the dispatcher.
//
// Replay runs on a dedicated internal session with `replaying` set, which
// means: nothing is appended to the WAL and no eviction runs. Expiry is frozen
// while loading (Keyspace.loading); a key whose deadline passed during the
// downtime is reaped normally once replay is done.

import { CorruptLogError } from "../errors";
import { ErrorReply } from "../types";
import type { Store } from "../store";
import { decodeCommand } from "./codec";

export class ReplayError extends Error {
  constructor(
    message: string,
    readonly index: number,
  ) {
    super(message);
    this.name = "ReplayError";
  }
}

/**
 * Applies `entries` to `store` in order. Returns the number of entries applied.
 * Throws CorruptLogError for undecodable entries and ReplayError when an
 * entry decodes but the command fails (that means the log and the code
 * disagree — never silently skip it).
 */
export function replayEntries(store: Store, entries: string[]): number {
  const session = store.replaySession();
  let applied = 0;
  const wasLoading = store.ks.loading;
  store.ks.loading = true;
  try {
    store.wal.suspend(() => {
      for (let i = 0; i < entries.length; i++) {
        const argv = decodeCommand(entries[i], i);
        const reply = session.exec(argv);
        if (reply instanceof ErrorReply) {
          throw new ReplayError(`WAL entry #${i} (${argv[0]}) failed on replay: ${reply.message}`, i);
        }
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
  return applied;
}

export { CorruptLogError };
