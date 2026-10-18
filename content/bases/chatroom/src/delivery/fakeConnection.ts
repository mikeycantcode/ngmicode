import type { Connection } from "./connection";
import type { Frame } from "./connection";

// In-memory Connection used by tests and the local simulator.
//
//   auto mode (default): every send() succeeds immediately.
//   manual mode: send() stays pending until release() is called — use it to
//     simulate a slow client.
//   failNext(n): the next n send() calls reject (simulates a flaky socket).

interface Pending {
  frame: Frame;
  resolve: () => void;
  reject: (e: Error) => void;
}

export class FakeConnection implements Connection {
  readonly id: string;
  readonly userId: string;
  /** Frames successfully delivered, in order. */
  readonly received: Frame[] = [];
  /** Every frame passed to send(), including failed attempts. */
  readonly attempts: Frame[] = [];
  closedReason: string | null = null;
  private manual: boolean;
  private failures = 0;
  private pending: Pending[] = [];

  constructor(id: string, userId: string, opts: { manual?: boolean } = {}) {
    this.id = id;
    this.userId = userId;
    this.manual = opts.manual ?? false;
  }

  get closed(): boolean {
    return this.closedReason !== null;
  }

  get inFlight(): number {
    return this.pending.length;
  }

  send(frame: Frame): Promise<void> {
    this.attempts.push(frame);
    if (this.closed) return Promise.reject(new Error("connection closed"));
    if (this.failures > 0) {
      this.failures--;
      return Promise.reject(new Error("socket write failed"));
    }
    if (!this.manual) {
      this.received.push(frame);
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      this.pending.push({
        frame,
        resolve: () => {
          this.received.push(frame);
          resolve();
        },
        reject,
      });
    });
  }

  /** Toggle manual mode. Sends already in flight are unaffected. */
  setManual(manual: boolean): void {
    this.manual = manual;
  }

  /** Completes up to `n` pending sends (manual mode). Returns how many were released. */
  release(n = 1): number {
    let done = 0;
    while (done < n && this.pending.length) {
      this.pending.shift()!.resolve();
      done++;
    }
    return done;
  }

  /** Switches to auto mode and lets everything through, awaiting the queue's follow-up sends. */
  async releaseAll(): Promise<void> {
    this.manual = false;
    for (let i = 0; i < 50; i++) {
      this.release(Infinity);
      await Promise.resolve();
    }
  }

  failNext(n = 1): void {
    this.failures += n;
  }

  close(reason: string): void {
    if (this.closed) return;
    this.closedReason = reason;
    for (const p of this.pending.splice(0)) p.reject(new Error("connection closed"));
  }

  types(): string[] {
    return this.received.map((f) => f.type);
  }
}
