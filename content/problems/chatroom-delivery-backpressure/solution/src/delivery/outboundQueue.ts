import type { Logger } from "../util/common";
import type { Connection, Frame } from "./connection";

// Per-connection FIFO with backpressure.
//
//   - At most one frame is in flight (shifted out of `items` and awaiting send()).
//   - `items` holds waiting frames, bounded by maxQueue.
//   - typing / presence.changed frames coalesce with their waiting predecessor.
//   - When full: shed the oldest waiting ephemeral frame; else drop an incoming
//     ephemeral frame; else disconnect the slow consumer.
//   - A failed send is retried in place (MAX_SEND_ATTEMPTS total) so ordering holds.

export const MAX_SEND_ATTEMPTS = 3;

export class OutboundQueue {
  private conn: Connection;
  private logger: Logger;
  private onClosed: (reason: string) => void;
  private maxQueue: number;
  private items: Frame[] = [];
  private draining = false;
  private idleWaiters: (() => void)[] = [];

  constructor(conn: Connection, opts: { logger: Logger; onClosed: (reason: string) => void; maxQueue: number }) {
    this.conn = conn;
    this.logger = opts.logger;
    this.onClosed = opts.onClosed;
    this.maxQueue = opts.maxQueue;
  }

  get size(): number {
    return this.items.length;
  }

  get busy(): boolean {
    return this.draining;
  }

  /** Returns false if the frame was not queued (dropped, or the connection is closed). */
  enqueue(frame: Frame): boolean {
    if (this.conn.closed) return false;
    this.coalesce(frame);
    if (this.items.length >= this.maxQueue) {
      const oldestEphemeral = this.items.findIndex((f) => f.ephemeral);
      if (oldestEphemeral >= 0) {
        this.items.splice(oldestEphemeral, 1);
      } else if (frame.ephemeral) {
        return false;
      } else {
        this.logger.log("warn", "slow consumer, closing connection", { conn: this.conn.id, waiting: this.items.length });
        this.close("slow_consumer");
        return false;
      }
    }
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

  private coalesce(frame: Frame): void {
    if (frame.type !== "typing" && frame.type !== "presence.changed") return;
    const p = frame.payload as { channelId?: string; userId?: string };
    const idx = this.items.findIndex((f) => {
      if (f.type !== frame.type) return false;
      const q = f.payload as { channelId?: string; userId?: string };
      return frame.type === "typing" ? q.channelId === p.channelId && q.userId === p.userId : q.userId === p.userId;
    });
    if (idx >= 0) this.items.splice(idx, 1);
  }

  private async drain(): Promise<void> {
    this.draining = true;
    try {
      while (this.items.length && !this.conn.closed) {
        const frame = this.items.shift()!;
        for (let attempt = 1; ; attempt++) {
          try {
            await this.conn.send(frame);
            break;
          } catch (e) {
            if (this.conn.closed) return; // closed underneath us (e.g. slow_consumer) — not a write failure
            if (attempt >= MAX_SEND_ATTEMPTS) {
              this.logger.log("warn", "send failed, closing connection", { conn: this.conn.id, error: String(e) });
              this.close("send_failed");
              return;
            }
          }
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
