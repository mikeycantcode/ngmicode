// Shared types for the whole engine. Keep this file free of runtime logic
// (other than the tiny ErrorReply class) so everything can import it.

import type { SortedSet } from "./datatypes/sorted-set";
import type { Keyspace } from "./core/keyspace";
import type { Session } from "./server/session";
import type { Store } from "./store";
import type { Clock } from "./util/clock";

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export interface StringValue {
  type: "string";
  data: string;
}

export interface ListValue {
  type: "list";
  data: string[];
}

export interface HashValue {
  type: "hash";
  data: Map<string, string>;
}

export interface ZSetValue {
  type: "zset";
  data: SortedSet;
}

export type Value = StringValue | ListValue | HashValue | ZSetValue;
export type ValueType = Value["type"];
export type ValueOf<T extends ValueType> = Extract<Value, { type: T }>;

export interface Entry {
  value: Value;
  /** Absolute expiry in ms (clock time), or null for persistent keys. */
  expiresAt: number | null;
  /** Cached result of entrySize(key, value). Maintained by Keyspace. */
  size: number;
}

// ---------------------------------------------------------------------------
// Replies
// ---------------------------------------------------------------------------

/** An error reply. Commands throw KvError; the dispatcher turns it into this. */
export class ErrorReply {
  constructor(readonly message: string) {}
}

/**
 * Reply shapes, modelled after RESP:
 *  - string  → bulk or status string ("OK", "QUEUED", "PONG")
 *  - number  → integer reply
 *  - null    → nil
 *  - array   → multi-bulk
 */
export type Reply = null | number | string | ErrorReply | Reply[];

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export type CommandFlag =
  | "write" // mutates the keyspace → WAL-logged when it actually changed something
  | "readonly"
  | "denyoom" // may grow memory → run eviction first, reject on OOM under noeviction
  | "admin"
  | "pubsub"
  | "fast";

export interface CommandContext {
  store: Store;
  ks: Keyspace;
  session: Session;
  clock: Clock;
  replaying: boolean;
  /**
   * Replace what gets written to the WAL for this command. By default the
   * original argv is logged. Use this for anything that is not deterministic
   * on replay (relative TTLs, float increments, ...).
   */
  rewrite(...argvs: string[][]): void;
}

export interface CommandSpec {
  /** Upper-case command name. */
  name: string;
  /** Redis-style arity: N = exactly N argv items (incl. name), -N = at least N. */
  arity: number;
  flags: CommandFlag[];
  /** Extracts key names from args (argv without the command name). */
  keys?: (args: string[]) => string[];
  handler: (ctx: CommandContext, args: string[]) => Reply;
}

// ---------------------------------------------------------------------------
// Pub/Sub
// ---------------------------------------------------------------------------

export type PubSubMessage =
  | { kind: "message"; channel: string; payload: string }
  | { kind: "pmessage"; pattern: string; channel: string; payload: string };
