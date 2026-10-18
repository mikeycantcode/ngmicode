import type { Logger } from "../util/common";
import type { Connection } from "./connection";
import type { Frame } from "./connection";

// Per-connection FIFO. Frames are written one at a time — we never have two
// send() calls in flight on the same connection, which is what keeps per-
// connection ordering intact.
//
// TODO(CHAT-388): the queue is unbounded. A client that stops reading will
// grow it forever. config.delivery.maxQueue exists but isn't wired up.

export class OutboundQueue {
  private conn: Connection;
  private logger: Logger;
  private onClosed: (reason: string) => void;
  private items: Frame[] = [];
  private draining = false;
  private idleWaiters: (() => void)[] = [];

  constructor(conn: Connection, opts: { logger: Logger; onClosed: (reason: string) => void }) {
    this.conn = conn;
    this.logger = opts.logger;
    this.onClosed = opts.onClosed;
  }

  get size(): number {
    return this.items.length;
  }

  get busy(): boolean {
    return this.draining;
  }

  /** Returns false if the connection is already closed. */
  enqueue(frame: Frame): boolean {
    if (this.conn.closed) return false;
    this.items.push(frame);
    if (!this.draining) void this.drain();
    return true;
  }

  /** Resolves once nothing is queued or in flight. */
  idle(): Promise<void> {
    if (!this.draining && this.items.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  close(reason: string): void {
    this.items = [];
    if (!this.conn.closed) this.conn.close(reason);
    this.onClosed(reason);
    this.notifyIdle();
  }

  private async drain(): Promise<void> {
    this.draining = true;
    try {
      while (this.items.length && !this.conn.closed) {
        const frame = this.items.shift()!;
        try {
          await this.conn.send(frame);
        } catch (e) {
          this.logger.log("warn", "send failed, closing connection", { conn: this.conn.id, error: String(e) });
          this.close("send_failed");
          return;
        }
      }
    } finally {
      this.draining = false;
      if (this.items.length === 0) this.notifyIdle();
    }
  }

  private notifyIdle(): void {
    for (const w of this.idleWaiters.splice(0)) w();
  }
}
