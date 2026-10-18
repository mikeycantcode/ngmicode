import type { EventBus, LedgerEvent } from "../lib/events";

export interface AuditQuery {
  tenantId?: string;
  type?: string;
  since?: number;
  limit?: number;
}

/**
 * Append-only audit trail fed from the event bus. Compliance requires every
 * money-moving event to land here; do not publish money movements without
 * going through the bus.
 */
export class AuditLog {
  private events: LedgerEvent[] = [];
  private readonly unsubscribe: () => void;

  constructor(bus: EventBus) {
    this.unsubscribe = bus.subscribe("*", (e) => {
      this.events.push({ ...e, payload: { ...e.payload } });
    });
  }

  query(q: AuditQuery = {}): LedgerEvent[] {
    let out = this.events.filter(
      (e) =>
        (q.tenantId === undefined || e.tenantId === q.tenantId) &&
        (q.type === undefined || e.type === q.type) &&
        (q.since === undefined || e.at >= q.since),
    );
    if (q.limit !== undefined) out = out.slice(-q.limit);
    return out.map((e) => ({ ...e, payload: { ...e.payload } }));
  }

  count(): number {
    return this.events.length;
  }

  detach(): void {
    this.unsubscribe();
  }
}
