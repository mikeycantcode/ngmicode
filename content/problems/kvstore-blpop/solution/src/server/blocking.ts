// Blocking list pops (BLPOP).
//
// A client whose BLPOP finds every key empty is parked here. After every
// top-level command (and therefore after a whole EXEC), serve() hands
// elements to parked clients in arrival order. Each element is popped through
// the dispatcher as a real LPOP on the waiter's session, so it is WAL-logged
// *after* the push that produced it and replay stays consistent.

import type { Store } from "../store";
import type { Reply } from "../types";
import type { TimerHandle } from "../util/clock";
import type { Session } from "./session";

interface Waiter {
  session: Session;
  keys: string[];
  resolve: (r: Reply) => void;
  timer: TimerHandle | null;
}

export class BlockingManager {
  private waiters: Waiter[] = [];
  private serving = false;

  constructor(private store: Store) {}

  get blockedCount(): number {
    return this.waiters.length;
  }

  /** Parks a client. timeoutMs = 0 blocks forever. */
  block(session: Session, keys: string[], timeoutMs: number): Promise<Reply> {
    return new Promise((resolve) => {
      const w: Waiter = { session, keys, resolve, timer: null };
      if (timeoutMs > 0) {
        w.timer = this.store.clock.setTimer(timeoutMs, () => {
          w.timer = null;
          if (this.remove(w)) resolve(null);
        });
      }
      this.waiters.push(w);
    });
  }

  /** Serves parked clients whose keys now hold data. FIFO by arrival. */
  serve(): void {
    if (this.serving || this.waiters.length === 0) return;
    this.serving = true;
    try {
      const lpop = this.store.dispatcher.lookup("LPOP")!;
      let progress = true;
      while (progress) {
        progress = false;
        for (const w of [...this.waiters]) {
          const key = w.keys.find((k) => {
            const e = this.store.ks.peek(k);
            return e !== undefined && e.value.type === "list" && e.value.data.length > 0;
          });
          if (key === undefined) continue;
          this.remove(w);
          const value = this.store.dispatcher.execute(w.session, lpop, ["LPOP", key]);
          w.resolve([key, value]);
          progress = true;
        }
      }
    } finally {
      this.serving = false;
    }
  }

  /** Unblocks every waiter of a session (connection closed): resolves null. */
  cancel(session: Session): void {
    for (const w of [...this.waiters]) {
      if (w.session !== session) continue;
      this.remove(w);
      w.resolve(null);
    }
  }

  private remove(w: Waiter): boolean {
    const i = this.waiters.indexOf(w);
    if (i === -1) return false;
    this.waiters.splice(i, 1);
    if (w.timer) this.store.clock.clearTimer(w.timer);
    w.timer = null;
    return true;
  }
}
