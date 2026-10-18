/**
 * In-process event bus. Services emit domain events after a state change has
 * been committed to the store; subscribers (event log, surge demand tracker,
 * payouts) react synchronously. Handlers must not throw — errors are caught
 * and reported to `onHandlerError` so one bad subscriber can't break a trip.
 */
export type FleetEventType =
  | "driver.registered"
  | "driver.status_changed"
  | "driver.location_updated"
  | "rider.registered"
  | "trip.requested"
  | "trip.matched"
  | "trip.driver_arrived"
  | "trip.started"
  | "trip.completed"
  | "trip.cancelled"
  | "dispatch.offer_sent"
  | "dispatch.offer_result"
  | "dispatch.failed"
  | "rating.submitted"
  | "payout.created"
  | "surge.updated";

export interface FleetEvent<T extends FleetEventType = FleetEventType> {
  type: T;
  /** epoch ms */
  at: number;
  /** primary entity id (trip id, driver id, ...) */
  entityId: string;
  data: Record<string, unknown>;
}

export type EventHandler = (event: FleetEvent) => void;

export class EventBus {
  private handlers = new Map<string, EventHandler[]>();
  onHandlerError: (err: unknown, event: FleetEvent) => void = () => undefined;

  /** Subscribe to one event type, or "*" for all. Returns an unsubscribe fn. */
  on(type: FleetEventType | "*", handler: EventHandler): () => void {
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

  emit(event: FleetEvent): void {
    const specific = this.handlers.get(event.type) ?? [];
    const wildcard = this.handlers.get("*") ?? [];
    for (const h of [...specific, ...wildcard]) {
      try {
        h(event);
      } catch (e) {
        this.onHandlerError(e, event);
      }
    }
  }
}
