// A client connection. Holds per-client state: transaction queue, WATCHed
// keys, pub/sub subscriptions and the inbox of delivered messages.

import { KvError } from "../errors";
import { tokenize } from "../protocol/tokenizer";
import type { Store } from "../store";
import { ErrorReply } from "../types";
import type { PubSubMessage, Reply } from "../types";

export class Session {
  readonly channels = new Set<string>();
  readonly patterns = new Set<string>();

  /** MULTI state. */
  inMulti = false;
  /** Set when a command failed to queue (unknown / bad arity) → EXEC aborts. */
  multiError = false;
  queue: string[][] = [];

  /** WATCH: key → keyspace version observed at WATCH time. */
  readonly watched = new Map<string, number>();

  closed = false;
  private inbox: PubSubMessage[] = [];
  private listeners = new Set<(m: PubSubMessage) => void>();

  constructor(
    readonly store: Store,
    readonly id: number,
    /** True only for the internal session used by WAL replay. */
    readonly replaying = false,
  ) {}

  /** Executes one command. Accepts an inline command line or a pre-split argv. */
  exec(input: string | string[]): Reply {
    if (this.closed) return new ErrorReply("ERR connection closed");
    let argv: string[];
    if (typeof input === "string") {
      try {
        argv = tokenize(input);
      } catch (e) {
        if (e instanceof KvError) return new ErrorReply(e.message);
        throw e;
      }
    } else {
      argv = input;
    }
    if (argv.length === 0) return new ErrorReply("ERR empty command");
    return this.store.dispatcher.dispatch(this, argv);
  }

  /**
   * Async entry point for hosts. Every command currently completes
   * synchronously; this exists so blocking commands can be added later
   * without changing the host API.
   * TODO: blocking list ops (BLPOP) — see roadmap in README.
   */
  async send(input: string | string[]): Promise<Reply> {
    return this.exec(input);
  }

  // ---- transactions -------------------------------------------------------

  beginMulti(): void {
    this.inMulti = true;
    this.multiError = false;
    this.queue = [];
  }

  discardMulti(): void {
    this.inMulti = false;
    this.multiError = false;
    this.queue = [];
  }

  unwatchAll(): void {
    this.watched.clear();
  }

  // ---- pub/sub ------------------------------------------------------------

  get subscriptionCount(): number {
    return this.channels.size + this.patterns.size;
  }

  deliver(msg: PubSubMessage): void {
    this.inbox.push(msg);
    for (const fn of this.listeners) fn(msg);
  }

  /** Returns and clears all messages delivered so far. */
  drain(): PubSubMessage[] {
    const out = this.inbox;
    this.inbox = [];
    return out;
  }

  onMessage(fn: (m: PubSubMessage) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  close(): void {
    if (this.closed) return;
    this.store.broker.removeSession(this);
    this.unwatchAll();
    this.discardMulti();
    this.closed = true;
    this.store.forgetSession(this);
  }
}
