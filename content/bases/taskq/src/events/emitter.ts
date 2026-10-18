type Listener<P> = (payload: P) => void;

/**
 * Synchronous typed event emitter. Listeners run in registration order. A
 * throwing listener is isolated: it is reported via `onListenerError` and the
 * remaining listeners still run (a buggy metrics hook must never take down a
 * worker).
 */
export class TypedEmitter<E extends Record<string, unknown>> {
  private listeners = new Map<keyof E, Listener<never>[]>();

  constructor(private readonly onListenerError?: (event: string, err: unknown) => void) {}

  on<K extends keyof E>(event: K, fn: Listener<E[K]>): () => void {
    const list = this.listeners.get(event) ?? [];
    list.push(fn as Listener<never>);
    this.listeners.set(event, list);
    return () => this.off(event, fn);
  }

  once<K extends keyof E>(event: K, fn: Listener<E[K]>): () => void {
    const off = this.on(event, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off<K extends keyof E>(event: K, fn: Listener<E[K]>): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const i = list.indexOf(fn as Listener<never>);
    if (i !== -1) list.splice(i, 1);
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const list = this.listeners.get(event);
    if (!list || list.length === 0) return;
    for (const fn of [...list]) {
      try {
        (fn as Listener<E[K]>)(payload);
      } catch (err) {
        this.onListenerError?.(String(event), err);
      }
    }
  }

  listenerCount(event: keyof E): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  /** Resolves with the next payload of `event` that satisfies `predicate`. */
  waitFor<K extends keyof E>(event: K, predicate: (p: E[K]) => boolean = () => true): Promise<E[K]> {
    return new Promise((resolve) => {
      const off = this.on(event, (p) => {
        if (!predicate(p)) return;
        off();
        resolve(p);
      });
    });
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
