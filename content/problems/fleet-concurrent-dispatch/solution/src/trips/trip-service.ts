import type { FleetConfig } from "../config";
import type { DriverRegistry } from "../drivers/driver-registry";
import { assertLatLng, type LatLng } from "../geo/latlng";
import { estimateTrip } from "../matching/eta";
import { computeFare } from "../pricing/fare";
import { calculateFareLegacy } from "../pricing/legacy-fare";
import type { PromoService } from "../pricing/promos";
import type { SurgeService } from "../pricing/surge";
import type { RiderService } from "../riders/rider-service";
import type { Clock } from "../shared/clock";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../shared/errors";
import type { EventBus, FleetEventType } from "../shared/events";
import type { IdGenerator } from "../shared/ids";
import { computeCancellationFee } from "./cancellation";
import { type CancelActorRole, isActive, type Trip } from "./trip";
import { assertTransition } from "./trip-state";
import type { TripStore } from "./trip";

export interface RequestTripInput {
  riderId: string;
  pickup: LatLng;
  dropoff: LatLng;
  promoCode?: string | null;
}

export interface CompleteTripInput {
  distanceMeters: number;
  durationSec: number;
}

export interface CancelActor {
  role: CancelActorRole;
  /** rider id / driver id; ignored for "system" */
  id: string;
}

export interface TripServiceDeps {
  store: TripStore;
  registry: DriverRegistry;
  riders: RiderService;
  promos: PromoService;
  surge: SurgeService;
  bus: EventBus;
  clock: Clock;
  ids: IdGenerator;
  config: FleetConfig;
}

/**
 * Trip lifecycle. Every mutation: load -> assertTransition -> put new
 * snapshot -> update driver status -> emit event (in that order).
 */
export class TripService {
  constructor(private readonly deps: TripServiceDeps) {}

  get(id: string): Trip {
    const t = this.deps.store.get(id);
    if (!t) throw new NotFoundError("trip", id);
    return t;
  }

  find(id: string): Trip | undefined {
    return this.deps.store.get(id);
  }

  listForRider(riderId: string): Trip[] {
    return this.deps.store.byRider(riderId);
  }

  activeTripForRider(riderId: string): Trip | undefined {
    return this.deps.store.byRider(riderId).find(isActive);
  }

  requestTrip(input: RequestTripInput): Trip {
    const { clock, config } = this.deps;
    const rider = this.deps.riders.get(input.riderId);
    if (rider.suspended) throw new ForbiddenError("rider is suspended");
    const pickup = assertLatLng(input.pickup, "pickup");
    const dropoff = assertLatLng(input.dropoff, "dropoff");
    // TODO: enforce LAUNCH_AREAS once ops finishes the Fiji pilot.
    if (this.activeTripForRider(rider.id)) {
      throw new ConflictError("rider_has_active_trip", "rider already has an active trip");
    }
    const promo = input.promoCode ? this.deps.promos.validate(input.promoCode, rider.id) : null;
    const surgeBps = this.deps.surge.bpsAt(pickup);

    // Upfront price (same formula the quote screen uses).
    const est = estimateTrip(pickup, dropoff, config.matching);
    const quotedFareCents = calculateFareLegacy(
      est.distanceMeters / 1000,
      est.durationSec / 60,
      surgeBps / 10_000,
      promo,
      config.pricing,
    );

    const now = clock.now();
    const trip: Trip = {
      id: this.deps.ids.next("trp"),
      riderId: rider.id,
      driverId: null,
      status: "requested",
      pickup,
      dropoff,
      surgeBps,
      promoCode: promo ? promo.code : null,
      quotedFareCents,
      pickupEtaSec: null,
      requestedAt: now,
      matchedAt: null,
      arrivedAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      cancelledBy: null,
      cancellationFeeCents: 0,
      distanceMeters: null,
      durationSec: null,
      fare: null,
    };
    this.deps.store.put(trip);
    this.emit("trip.requested", trip, { riderId: rider.id, pickup, surgeBps });
    return this.get(trip.id);
  }

  /** Called by the dispatcher once a driver accepted the offer. */
  assignDriver(tripId: string, driverId: string, etaSec: number): Trip {
    const trip = this.get(tripId);
    assertTransition(trip.status, "matched");
    const driver = this.deps.registry.get(driverId);
    if (driver.status !== "available") {
      throw new ConflictError("driver_unavailable", `driver ${driverId} is ${driver.status}`);
    }
    const next: Trip = { ...trip, status: "matched", driverId, matchedAt: this.deps.clock.now(), pickupEtaSec: etaSec };
    this.deps.store.put(next);
    this.deps.registry.setStatus(driverId, "on_trip", tripId);
    this.emit("trip.matched", next, { driverId, etaSec });
    return this.get(tripId);
  }

  markArrived(tripId: string, driverId: string): Trip {
    const trip = this.assertDriverOf(tripId, driverId);
    assertTransition(trip.status, "driver_arrived");
    const next: Trip = { ...trip, status: "driver_arrived", arrivedAt: this.deps.clock.now() };
    this.deps.store.put(next);
    this.emit("trip.driver_arrived", next, { driverId });
    return this.get(tripId);
  }

  startTrip(tripId: string, driverId: string): Trip {
    const trip = this.assertDriverOf(tripId, driverId);
    assertTransition(trip.status, "in_progress");
    const next: Trip = { ...trip, status: "in_progress", startedAt: this.deps.clock.now() };
    this.deps.store.put(next);
    this.emit("trip.started", next, { driverId });
    return this.get(tripId);
  }

  completeTrip(tripId: string, driverId: string, input: CompleteTripInput): Trip {
    const trip = this.assertDriverOf(tripId, driverId);
    assertTransition(trip.status, "completed");
    if (!Number.isInteger(input.distanceMeters) || input.distanceMeters < 0) {
      throw new ValidationError("distanceMeters must be a non-negative integer");
    }
    if (!Number.isInteger(input.durationSec) || input.durationSec < 0) {
      throw new ValidationError("durationSec must be a non-negative integer");
    }
    const promo = trip.promoCode ? this.deps.promos.get(trip.promoCode) : null;
    const fare = computeFare(
      { distanceMeters: input.distanceMeters, durationSec: input.durationSec, surgeBps: trip.surgeBps, promo },
      this.deps.config.pricing,
      this.deps.config.currency,
    );
    const next: Trip = {
      ...trip,
      status: "completed",
      completedAt: this.deps.clock.now(),
      distanceMeters: input.distanceMeters,
      durationSec: input.durationSec,
      fare,
    };
    this.deps.store.put(next);
    if (promo) this.deps.promos.redeem(promo.code, trip.riderId);
    this.deps.registry.setStatus(driverId, "available", null);
    this.emit("trip.completed", next, { driverId, totalCents: fare.totalCents });
    return this.get(tripId);
  }

  cancelTrip(tripId: string, actor: CancelActor): Trip {
    const trip = this.get(tripId);
    if (actor.role === "rider" && actor.id !== trip.riderId) throw new ForbiddenError("not your trip");
    if (actor.role === "driver" && actor.id !== trip.driverId) throw new ForbiddenError("not your trip");
    assertTransition(trip.status, "cancelled");
    const now = this.deps.clock.now();
    const fee = computeCancellationFee(trip, actor.role, now, this.deps.config.trips);
    const next: Trip = {
      ...trip,
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: actor.role,
      cancellationFeeCents: fee,
    };
    this.deps.store.put(next);
    if (trip.driverId) this.deps.registry.setStatus(trip.driverId, "available", null);
    this.emit("trip.cancelled", next, { by: actor.role, feeCents: fee, driverId: trip.driverId });
    return this.get(tripId);
  }

  private assertDriverOf(tripId: string, driverId: string): Trip {
    const trip = this.get(tripId);
    if (trip.driverId !== driverId) throw new ForbiddenError("not your trip");
    return trip;
  }

  private emit(type: FleetEventType, trip: Trip, data: Record<string, unknown>) {
    this.deps.bus.emit({ type, at: this.deps.clock.now(), entityId: trip.id, data });
  }
}
