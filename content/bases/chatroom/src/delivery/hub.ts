import type { Logger } from "../util/common";
import type { Connection } from "./connection";
import { OutboundQueue } from "./outboundQueue";

interface Entry {
  conn: Connection;
  queue: OutboundQueue;
  seq: number;
}

// Registry of live client connections. One user may have many (tabs, phone).

export class ConnectionHub {
  private entries = new Map<string, Entry>();
  private byUser = new Map<string, Set<string>>();
  private listeners: ((userId: string) => void)[] = [];
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  onChange(listener: (userId: string) => void): void {
    this.listeners.push(listener);
  }

  register(conn: Connection): void {
    if (this.entries.has(conn.id)) throw new Error(`connection ${conn.id} already registered`);
    const queue = new OutboundQueue(conn, {
      logger: this.logger,
      onClosed: () => this.forget(conn.id),
    });
    this.entries.set(conn.id, { conn, queue, seq: 0 });
    let set = this.byUser.get(conn.userId);
    if (!set) {
      set = new Set();
      this.byUser.set(conn.userId, set);
    }
    set.add(conn.id);
    this.notify(conn.userId);
  }

  unregister(connId: string, reason = "client_closed"): void {
    const e = this.entries.get(connId);
    if (!e) return;
    e.queue.close(reason);
  }

  connectionsFor(userId: string): Connection[] {
    const ids = this.byUser.get(userId);
    if (!ids) return [];
    return [...ids].map((id) => this.entries.get(id)!.conn);
  }

  isConnected(userId: string): boolean {
    return (this.byUser.get(userId)?.size ?? 0) > 0;
  }

  get connectionCount(): number {
    return this.entries.size;
  }

  /** Queues a frame for one connection. Returns false if the connection is gone. */
  deliver(connId: string, type: string, payload: unknown, ephemeral: boolean): boolean {
    const e = this.entries.get(connId);
    if (!e) return false;
    e.seq += 1;
    return e.queue.enqueue({ seq: e.seq, type, payload, ephemeral });
  }

  queueSize(connId: string): number {
    return this.entries.get(connId)?.queue.size ?? 0;
  }

  /** Resolves once every queue has drained (or its connection has closed). */
  async idle(): Promise<void> {
    await Promise.all([...this.entries.values()].map((e) => e.queue.idle()));
  }

  private forget(connId: string): void {
    const e = this.entries.get(connId);
    if (!e) return;
    this.entries.delete(connId);
    const set = this.byUser.get(e.conn.userId);
    set?.delete(connId);
    if (set && set.size === 0) this.byUser.delete(e.conn.userId);
    this.notify(e.conn.userId);
  }

  private notify(userId: string): void {
    for (const l of this.listeners) l(userId);
  }
}
