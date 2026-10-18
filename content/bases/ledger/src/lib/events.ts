export type LedgerEventType =
  | "account.opened"
  | "account.closed"
  | "entry.posted"
  | "entry.reversed"
  | "entries.imported"
  | "payment.authorized"
  | "payment.captured"
  | "payment.voided"
  | "payment.refunded"
  | "payment.expired"
  | "fx.rate_set";

export interface LedgerEvent {
  seq: number;
  type: LedgerEventType | string;
  at: number;
  tenantId?: string;
  payload: Record<string, unknown>;
}

export type EventHandler = (event: LedgerEvent) => void;

/**
 * Synchronous in-process event bus. Handlers run in subscription order inside
 * publish(); a throwing handler is isolated (logged via onError) so one bad
 * consumer cannot break a posting.
 */
export class EventBus {
  private handlers = new Map<string, EventHandler[]>();
  private seq = 0;

  constructor(
    private readonly now: () => number,
    private readonly onError: (e: unknown, event: LedgerEvent) => void = () => {},
  ) {}

  /** Subscribe to one event type, or "*" for everything. Returns an unsubscribe fn. */
  subscribe(type: LedgerEventType | "*" | string, handler: EventHandler): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
    return () => {
      const cur = this.handlers.get(type) ?? [];
      this.handlers.set(
        type,
        cur.filter((h) => h !== handler),
      );
    };
  }

  publish(type: LedgerEventType | string, payload: Record<string, unknown>, tenantId?: string): LedgerEvent {
    const event: LedgerEvent = { seq: ++this.seq, type, at: this.now(), tenantId, payload };
    for (const h of [...(this.handlers.get(type) ?? []), ...(this.handlers.get("*") ?? [])]) {
      try {
        h(event);
      } catch (e) {
        this.onError(e, event);
      }
    }
    return event;
  }
}
