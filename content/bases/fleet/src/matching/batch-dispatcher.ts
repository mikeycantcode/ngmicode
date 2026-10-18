import type { MatchingConfig } from "../config";
import type { DriverRegistry } from "../drivers/driver-registry";
import type { TripService } from "../trips/trip-service";
import { estimatePickupEtaSec } from "./eta";

export interface BatchAssignment {
  tripId: string;
  driverId: string;
  etaSec: number;
}

interface Pair extends BatchAssignment {
  distanceKm: number;
}

/**
 * Batch matching for high-demand windows (stadiums, airports). Requests are
 * collected for a short window, then assigned together, greedily by globally
 * smallest ETA. Drivers in batch zones have opted into auto-accept, so no
 * offer round-trip happens here.
 *
 * Each request only considers its `candidatesPerRequest` nearest drivers.
 * Requests that get nothing stay queued for the next window.
 */
export class BatchDispatcher {
  private pending: string[] = [];

  constructor(private readonly deps: { registry: DriverRegistry; trips: TripService; config: MatchingConfig }) {}

  enqueue(tripId: string): void {
    this.pending.push(tripId);
  }

  pendingCount(): number {
    return this.pending.length;
  }

  flush(): BatchAssignment[] {
    const { registry, trips, config } = this.deps;
    const pairs: Pair[] = [];
    const live: string[] = [];
    for (const tripId of this.pending) {
      const trip = trips.find(tripId);
      if (!trip || trip.status !== "requested") continue;
      live.push(tripId);
      for (const c of registry.findAvailableNear(trip.pickup, config.searchRadiusKm, config.candidatesPerRequest)) {
        pairs.push({ tripId, driverId: c.driver.id, distanceKm: c.distanceKm, etaSec: estimatePickupEtaSec(c.distanceKm, config) });
      }
    }

    pairs.sort(
      (a, b) =>
        a.etaSec - b.etaSec ||
        a.distanceKm - b.distanceKm ||
        (a.tripId < b.tripId ? -1 : a.tripId > b.tripId ? 1 : 0) ||
        (a.driverId < b.driverId ? -1 : a.driverId > b.driverId ? 1 : 0),
    );

    const usedTrips = new Set<string>();
    const usedDrivers = new Set<string>();
    const out: BatchAssignment[] = [];
    for (const p of pairs) {
      if (usedTrips.has(p.tripId) || usedDrivers.has(p.driverId)) continue;
      usedTrips.add(p.tripId);
      usedDrivers.add(p.driverId);
      trips.assignDriver(p.tripId, p.driverId, p.etaSec);
      out.push({ tripId: p.tripId, driverId: p.driverId, etaSec: p.etaSec });
    }

    this.pending = live.filter((id) => !usedTrips.has(id));
    return out;
  }
}
