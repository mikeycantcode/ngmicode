import type { EventBus, FleetEvent, FleetEventType } from "../shared/events";

export interface LoggedEvent extends FleetEvent {
  seq: number;
}

export interface EventQuery {
  type?: FleetEventType;
  entityId?: string;
  /** exclusive */
  afterSeq?: number;
  limit?: number;
}

/**
 * Append-only audit log of every domain event. Sequence numbers start at 1
 * and are gap-free. High-volume location pings are sampled (see below).
 */
export class EventLog {
  private readonly events: LoggedEvent[] = [];
  private seq = 0;
  private droppedPings = 0;

  constructor(bus: EventBus, private readonly opts: { logLocationPings?: boolean } = {}) {
    bus.on("*", (e) => this.append(e));
  }

  private append(e: FleetEvent) {
    // Location pings are ~95% of traffic; the audit log doesn't need them.
    if (e.type === "driver.location_updated" && !this.opts.logLocationPings) {
      this.droppedPings++;
      return;
    }
    this.events.push({ ...e, data: { ...e.data }, seq: ++this.seq });
  }

  query(q: EventQuery = {}): LoggedEvent[] {
    const out: LoggedEvent[] = [];
    for (const e of this.events) {
      if (q.afterSeq !== undefined && e.seq <= q.afterSeq) continue;
      if (q.type && e.type !== q.type) continue;
      if (q.entityId && e.entityId !== q.entityId) continue;
      out.push(e);
      if (q.limit !== undefined && out.length >= q.limit) break;
    }
    return out;
  }

  get size(): number {
    return this.events.length;
  }

  get droppedLocationPings(): number {
    return this.droppedPings;
  }
}
