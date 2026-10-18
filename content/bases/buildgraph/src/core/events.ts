/**
 * Minimal typed event bus. The runner, scheduler and cache emit events here; the CLI
 * subscribes to build its structured output and tests subscribe to observe ordering.
 */
export interface BuildEvents {
  "task:start": { id: string; at: number };
  "task:end": { id: string; at: number; status: "executed" | "cached" | "failed" | "skipped" };
  "cache:hit": { id: string; hash: string };
  "cache:miss": { id: string; hash: string };
  "cache:put": { id: string; hash: string; files: number };
  "run:start": { tasks: number };
  "run:complete": { ok: boolean; durationMs: number };
  warn: { message: string; id?: string };
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends Record<string, any> = BuildEvents> {
  private handlers = new Map<keyof E, Set<Handler<any>>>();
  /** When enabled, every emitted event is appended here (handy in tests). */
  readonly history: { type: keyof E; payload: unknown }[] = [];
  private recording: boolean;

  constructor(opts: { record?: boolean } = {}) {
    this.recording = !!opts.record;
  }

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    if (this.recording) this.history.push({ type, payload });
    const set = this.handlers.get(type);
    if (!set) return;
    for (const h of [...set]) h(payload);
  }

  of<K extends keyof E>(type: K): E[K][] {
    return this.history.filter((h) => h.type === type).map((h) => h.payload as E[K]);
  }
}
