// Synchronous in-process event bus. Handlers run in subscription order, inside
// the emitter's call stack. A throwing handler is logged and swallowed so one
// bad subscriber can't break a write path.

import type { DomainEvent } from "../domain/types";

type Handler<E> = (event: E) => void;

export class EventBus {
  private handlers = new Map<string, Handler<DomainEvent>[]>();
  private any: Handler<DomainEvent>[] = [];
  readonly errors: { type: string; error: unknown }[] = [];

  on<T extends DomainEvent["type"]>(type: T, handler: Handler<Extract<DomainEvent, { type: T }>>): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as Handler<DomainEvent>);
    this.handlers.set(type, list);
    return () => {
      const cur = this.handlers.get(type) ?? [];
      this.handlers.set(
        type,
        cur.filter((h) => h !== handler),
      );
    };
  }

  onAny(handler: Handler<DomainEvent>): () => void {
    this.any.push(handler);
    return () => {
      this.any = this.any.filter((h) => h !== handler);
    };
  }

  emit(event: DomainEvent): void {
    for (const h of [...(this.handlers.get(event.type) ?? []), ...this.any]) {
      try {
        h(event);
      } catch (error) {
        this.errors.push({ type: event.type, error });
      }
    }
  }
}
