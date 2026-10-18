// Store: wires the engine together and is the main entry point for hosts.
//
//   const store = new Store({ clock: new ManualClock() });
//   const s = store.connect();
//   s.exec("SET greeting hello EX 10");
//   store.tick();                // active expiry; call periodically
//   store.wal.entries            // persist these
//   Store.restore({}, { wal })   // ...and rebuild later

import { Config } from "./config";
import { Evictor } from "./core/eviction";
import { EventBus } from "./core/events";
import { ExpiryManager } from "./core/expiry";
import { Keyspace } from "./core/keyspace";
import { Stats } from "./core/stats";
import { buildRegistry } from "./commands/registry";
import { replayEntries } from "./persistence/replay";
import { createSnapshot, loadSnapshot, plainValue, rewriteCommands } from "./persistence/snapshot";
import { encodeCommand } from "./persistence/codec";
import { WriteAheadLog } from "./persistence/wal";
import { Broker } from "./pubsub/broker";
import { Notifier } from "./pubsub/notifications";
import { ScanCursors } from "./scan/cursor";
import { Dispatcher } from "./server/dispatcher";
import { Session } from "./server/session";
import type { CommandSpec, Reply } from "./types";
import { SystemClock } from "./util/clock";
import type { Clock } from "./util/clock";
import { nowMs } from "./util/time";

export interface StoreOptions {
  clock?: Clock;
  /** Initial CONFIG values, e.g. { maxmemory: 4096, "maxmemory-policy": "allkeys-lru" }. */
  config?: Record<string, string | number>;
  /** Extra commands (host extensions). */
  commands?: CommandSpec[];
}

export interface RestoreSource {
  snapshot?: string | null;
  wal?: string[];
}

export interface DumpedEntry {
  type: string;
  value: unknown;
  expiresAt: number | null;
}

export class Store {
  readonly clock: Clock;
  readonly config: Config;
  readonly stats = new Stats();
  readonly events = new EventBus();
  readonly wal = new WriteAheadLog();
  readonly broker = new Broker();
  readonly scans = new ScanCursors();
  readonly ks: Keyspace;
  readonly expiry: ExpiryManager;
  readonly evictor: Evictor;
  readonly dispatcher: Dispatcher;
  readonly notifier: Notifier;

  /** Last snapshot produced by SAVE. */
  lastSave: string | null = null;

  private sessions = new Set<Session>();
  private nextSessionId = 1;
  private defaultSession: Session | null = null;

  constructor(opts: StoreOptions = {}) {
    this.clock = opts.clock ?? new SystemClock();
    this.config = new Config(opts.config);
    this.ks = new Keyspace(this.clock, this.stats, this.events);
    this.expiry = new ExpiryManager(this.ks, this.config);
    this.evictor = new Evictor(this.ks, this.config);
    this.dispatcher = new Dispatcher(this, buildRegistry(opts.commands));
    this.notifier = new Notifier(this);

    // Expired / evicted keys are logged as explicit DELs so that replay does
    // not depend on the clock at replay time.
    this.ks.hooks = {
      onExpired: (key) => {
        this.wal.append(["DEL", key]);
        this.notifier.notify("expired", key);
      },
      onEvicted: (key) => {
        this.wal.append(["DEL", key]);
        this.notifier.notify("evicted", key);
      },
      onModified: (key) => this.notifier.touch(key),
    };
  }

  // ---- sessions -----------------------------------------------------------

  connect(): Session {
    const s = new Session(this, this.nextSessionId++);
    this.sessions.add(s);
    return s;
  }

  /** Internal session used by WAL replay (no logging, no eviction). */
  replaySession(): Session {
    return new Session(this, 0, true);
  }

  forgetSession(s: Session): void {
    this.sessions.delete(s);
    if (this.defaultSession === s) this.defaultSession = null;
  }

  get connectedSessions(): number {
    return this.sessions.size;
  }

  /** Convenience: run a command on a shared default session. */
  exec(input: string | string[]): Reply {
    if (!this.defaultSession) this.defaultSession = this.connect();
    return this.defaultSession.exec(input);
  }

  // ---- housekeeping -------------------------------------------------------

  /** Background work; hosts call this periodically (e.g. every 100 ms). */
  tick(): number {
    return this.expiry.cycle();
  }

  info(): Record<string, number | string> {
    return {
      uptime_ms: this.stats.uptimeMs(),
      connected_clients: this.sessions.size,
      used_memory: this.ks.usedMemory,
      maxmemory: this.config.getNumber("maxmemory"),
      maxmemory_policy: this.config.get("maxmemory-policy"),
      keys: this.ks.size,
      expires: this.ks.volatileCount,
      total_commands_processed: this.stats.commandsProcessed,
      keyspace_hits: this.stats.keyspaceHits,
      keyspace_misses: this.stats.keyspaceMisses,
      expired_keys: this.stats.expiredKeys,
      evicted_keys: this.stats.evictedKeys,
      rejected_commands: this.stats.rejectedCommands,
      pubsub_channels: this.broker.channelCount,
      pubsub_patterns: this.broker.patternCount,
      wal_entries: this.wal.length,
    };
  }

  // ---- persistence --------------------------------------------------------

  snapshot(): string {
    // FIXME: createdAt should use this.clock — nowMs() predates the Clock.
    return createSnapshot(this.ks, nowMs());
  }

  /** Re-executes WAL entries against this store. Returns entries applied. */
  replay(entries: string[]): number {
    return replayEntries(this, entries);
  }

  /** Rewrites the WAL to the minimal form of the current state. Returns its length. */
  compact(): number {
    const cmds = rewriteCommands(this.ks);
    this.wal.reset(cmds.map(encodeCommand));
    return cmds.length;
  }

  /** Builds a store from a snapshot and/or WAL. The WAL keeps the given entries. */
  static restore(opts: StoreOptions, src: RestoreSource): Store {
    const store = new Store(opts);
    if (src.snapshot) {
      store.ks.loading = true;
      try {
        store.wal.suspend(() => loadSnapshot(store.ks, src.snapshot!));
      } finally {
        store.ks.loading = false;
      }
    }
    if (src.wal) {
      store.replay(src.wal);
      store.wal.reset(src.wal);
    }
    return store;
  }

  /** Plain-JS view of every live key (sorted by key). For tests and debugging. */
  dump(): Record<string, DumpedEntry> {
    const out: Record<string, DumpedEntry> = {};
    const keys = this.ks.keys().sort();
    for (const k of keys) {
      const e = this.ks.peek(k)!;
      out[k] = { type: e.value.type, value: plainValue(e.value), expiresAt: e.expiresAt };
    }
    return out;
  }
}
