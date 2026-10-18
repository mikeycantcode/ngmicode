import type { Clock } from "./clock";

// Every event the system emits. Adding a new event? Add it to this union so
// EventBus.on() stays type-checked.
export type DomainEvent =
  | { type: "product.created"; productId: string }
  | { type: "product.updated"; productId: string; changes: string[] }
  | { type: "inventory.adjusted"; sku: string; delta: number; reason: string }
  | { type: "inventory.low_stock"; sku: string; available: number }
  | { type: "customer.registered"; customerId: string }
  | { type: "order.placed"; orderId: string; customerId: string; totalCents: number }
  | { type: "order.paid"; orderId: string; paymentId: string }
  | { type: "order.shipped"; orderId: string; trackingNumber: string }
  | { type: "order.delivered"; orderId: string }
  | { type: "order.cancelled"; orderId: string; reason: string };

export type DomainEventType = DomainEvent["type"];

type Handler<E> = (event: E & { at: number }) => void;

/**
 * Synchronous in-process event bus. Handlers run inline in emit order; a handler
 * that throws does NOT stop other handlers (errors are collected in `failures`).
 * `history` keeps every emitted event — handy in tests and for the audit log.
 */
export class EventBus {
  readonly history: Array<DomainEvent & { at: number }> = [];
  readonly failures: Array<{ type: string; error: unknown }> = [];
  private handlers = new Map<string, Handler<DomainEvent>[]>();

  constructor(private clock: Clock) {}

  on<T extends DomainEvent["type"]>(type: T | "*", handler: Handler<Extract<DomainEvent, { type: T }>>): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as Handler<DomainEvent>);
    this.handlers.set(type, list);
    return () => {
      const i = list.indexOf(handler as Handler<DomainEvent>);
      if (i >= 0) list.splice(i, 1);
    };
  }

  emit(event: DomainEvent): void {
    const stamped = { ...event, at: this.clock.now() };
    this.history.push(stamped);
    const targets = [...(this.handlers.get(event.type) ?? []), ...(this.handlers.get("*") ?? [])];
    for (const h of targets) {
      try {
        h(stamped);
      } catch (error) {
        this.failures.push({ type: event.type, error });
      }
    }
  }

  ofType<T extends DomainEvent["type"]>(type: T): Array<Extract<DomainEvent, { type: T }> & { at: number }> {
    return this.history.filter((e) => e.type === type) as Array<Extract<DomainEvent, { type: T }> & { at: number }>;
  }
}
