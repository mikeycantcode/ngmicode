import type { MatchingConfig } from "../config";
import type { DriverRegistry } from "../drivers/driver-registry";
import type { Clock } from "../shared/clock";
import { ConflictError } from "../shared/errors";
import type { EventBus } from "../shared/events";
import type { TripService } from "../trips/trip-service";
import { rankCandidates } from "./matcher";

/**
 * Offering a trip to a driver is asynchronous: we push the offer to the
 * driver app and wait (up to ~15s in production) for accept/decline.
 */
export type OfferOutcome = "accepted" | "declined" | "timeout";

export interface OfferGateway {
  offer(driverId: string, tripId: string): Promise<OfferOutcome>;
}

/** Every driver accepts on the next tick. Default in dev and tests. */
export class AutoAcceptGateway implements OfferGateway {
  readonly sent: Array<{ driverId: string; tripId: string }> = [];

  async offer(driverId: string, tripId: string): Promise<OfferOutcome> {
    this.sent.push({ driverId, tripId });
    await Promise.resolve();
    return "accepted";
  }
}

/**
 * Per-driver scripted responses; drivers without a script accept.
 * e.g. new ScriptedGateway({ drv_000001: ["declined", "accepted"] })
 */
export class ScriptedGateway implements OfferGateway {
  readonly sent: Array<{ driverId: string; tripId: string }> = [];

  constructor(private readonly script: Record<string, OfferOutcome[]>) {}

  async offer(driverId: string, tripId: string): Promise<OfferOutcome> {
    this.sent.push({ driverId, tripId });
    await Promise.resolve();
    const queue = this.script[driverId];
    return queue && queue.length ? queue.shift()! : "accepted";
  }
}

export type DispatchResult =
  | { status: "matched"; tripId: string; driverId: string; etaSec: number }
  | { status: "no_drivers"; tripId: string }
  | { status: "cancelled"; tripId: string };

export interface DispatcherDeps {
  registry: DriverRegistry;
  trips: TripService;
  offers: OfferGateway;
  bus: EventBus;
  clock: Clock;
  config: MatchingConfig;
}

/**
 * Real-time dispatch: offer the trip to the best available driver, wait for
 * their answer, and on decline/timeout move on to the next best — up to
 * `maxOffers` drivers. Many dispatches run concurrently (one per request).
 */
export class Dispatcher {
  constructor(private readonly deps: DispatcherDeps) {}

  async dispatch(tripId: string): Promise<DispatchResult> {
    const { registry, trips, offers, config } = this.deps;
    const tried = new Set<string>();

    for (let attempt = 0; attempt < config.maxOffers; attempt++) {
      const trip = trips.get(tripId);
      if (trip.status === "cancelled") return { status: "cancelled", tripId };
      if (trip.status !== "requested") {
        throw new ConflictError("trip_not_dispatchable", `trip ${tripId} is ${trip.status}`);
      }

      const ranked = rankCandidates(registry.findAvailableNear(trip.pickup), config).filter((c) => !tried.has(c.driverId));
      const best = ranked[0];
      if (!best) break;
      tried.add(best.driverId);

      this.emit("dispatch.offer_sent", tripId, { driverId: best.driverId, attempt, etaSec: best.etaSec });
      const outcome = await offers.offer(best.driverId, tripId);
      this.emit("dispatch.offer_result", tripId, { driverId: best.driverId, outcome });

      if (outcome === "accepted") {
        trips.assignDriver(tripId, best.driverId, best.etaSec);
        return { status: "matched", tripId, driverId: best.driverId, etaSec: best.etaSec };
      }
    }

    this.emit("dispatch.failed", tripId, { tried: [...tried] });
    return { status: "no_drivers", tripId };
  }

  private emit(type: "dispatch.offer_sent" | "dispatch.offer_result" | "dispatch.failed", tripId: string, data: Record<string, unknown>) {
    this.deps.bus.emit({ type, at: this.deps.clock.now(), entityId: tripId, data });
  }
}
