// Internal, synchronous event bus. This is for in-process observers (metrics,
// tests, blocking-ops plumbing) — it is NOT the client-facing pub/sub system,
// which lives in src/pubsub.

import type { Session } from "../server/session";

export interface EngineEvents {
  /** A key was removed because its TTL elapsed (lazy or active expiry). */
  expired: { key: string };
  /** A key was removed by the eviction policy to stay under maxmemory. */
  evicted: { key: string };
  /** Every command that ran to completion (including errors and replayed commands). */
  command: { name: string; argv: string[]; session: Session; replaying: boolean };
  /** FLUSHALL. */
  flush: { keys: number };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof EngineEvents, Set<Handler<never>>>();

  on<K extends keyof EngineEvents>(name: K, fn: Handler<EngineEvents[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof EngineEvents>(name: K, payload: EngineEvents[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<EngineEvents[K]>)(payload);
  }

  listenerCount(name: keyof EngineEvents): number {
    return this.handlers.get(name)?.size ?? 0;
  }
}
