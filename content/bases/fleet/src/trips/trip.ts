import type { LatLng } from "../geo/latlng";
import type { FareBreakdown } from "../pricing/fare";
import type { Bps, Cents } from "../shared/money";

/**
 *   requested ──► matched ──► driver_arrived ──► in_progress ──► completed
 *       │            │               │
 *       └────────────┴───────────────┴──────────► cancelled
 */
export type TripStatus = "requested" | "matched" | "driver_arrived" | "in_progress" | "completed" | "cancelled";

export type CancelActorRole = "rider" | "driver" | "system";

export interface Trip {
  id: string;
  riderId: string;
  driverId: string | null;
  status: TripStatus;
  pickup: LatLng;
  dropoff: LatLng;

  /** Surge multiplier locked in when the trip was requested. */
  surgeBps: Bps;
  promoCode: string | null;
  /** Upfront price shown to the rider at request time. */
  quotedFareCents: Cents | null;
  pickupEtaSec: number | null;

  requestedAt: number;
  matchedAt: number | null;
  arrivedAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
  cancelledAt: number | null;
  cancelledBy: CancelActorRole | null;
  cancellationFeeCents: Cents;

  /** Reported by the driver app on completion. */
  distanceMeters: number | null;
  durationSec: number | null;
  fare: FareBreakdown | null;
}

export const ACTIVE_STATUSES: readonly TripStatus[] = ["requested", "matched", "driver_arrived", "in_progress"];

export function isActive(trip: Trip): boolean {
  return ACTIVE_STATUSES.includes(trip.status);
}

/** Immutable snapshots, same contract as DriverStore. */
export interface TripStore {
  get(id: string): Trip | undefined;
  put(trip: Trip): void;
  all(): Trip[];
  byRider(riderId: string): Trip[];
}

export class InMemoryTripStore implements TripStore {
  private readonly rows = new Map<string, Trip>();
  private readonly riderIndex = new Map<string, string[]>();

  get(id: string): Trip | undefined {
    return this.rows.get(id);
  }

  put(trip: Trip): void {
    if (!this.rows.has(trip.id)) {
      const list = this.riderIndex.get(trip.riderId) ?? [];
      list.push(trip.id);
      this.riderIndex.set(trip.riderId, list);
    }
    this.rows.set(trip.id, Object.freeze({ ...trip }) as Trip);
  }

  all(): Trip[] {
    return [...this.rows.values()];
  }

  byRider(riderId: string): Trip[] {
    return (this.riderIndex.get(riderId) ?? []).map((id) => this.rows.get(id)!);
  }
}
