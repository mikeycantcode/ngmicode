import type { MatchingConfig } from "../config";
import { GridIndex } from "../geo/grid-index";
import { assertLatLng, type LatLng } from "../geo/latlng";
import type { Clock } from "../shared/clock";
import { ConflictError, NotFoundError, ValidationError } from "../shared/errors";
import type { EventBus } from "../shared/events";
import type { IdGenerator } from "../shared/ids";
import type { Driver, DriverCandidate, DriverStatus, Vehicle } from "./driver";
import type { DriverStore } from "./driver";

export interface RegisterDriverInput {
  name: string;
  vehicle: Vehicle;
}

export interface DriverRegistryDeps {
  store: DriverStore;
  index: GridIndex;
  bus: EventBus;
  clock: Clock;
  ids: IdGenerator;
  config: MatchingConfig;
}

/**
 * Owns driver state: registration, online/offline, location pings and the
 * spatial index used to find nearby drivers. The index contains every driver
 * that has ever sent a location; status/staleness are filtered at query time.
 */
export class DriverRegistry {
  constructor(private readonly deps: DriverRegistryDeps) {}

  register(input: RegisterDriverInput): Driver {
    if (!input.name || !input.name.trim()) throw new ValidationError("name is required");
    if (!input.vehicle || !input.vehicle.plate) throw new ValidationError("vehicle.plate is required");
    const driver: Driver = {
      id: this.deps.ids.next("drv"),
      name: input.name.trim(),
      vehicle: { ...input.vehicle },
      status: "offline",
      location: null,
      locationUpdatedAt: null,
      currentTripId: null,
      createdAt: this.deps.clock.now(),
    };
    this.deps.store.put(driver);
    this.emit("driver.registered", driver.id, { name: driver.name });
    return this.get(driver.id);
  }

  find(id: string): Driver | undefined {
    return this.deps.store.get(id);
  }

  get(id: string): Driver {
    const d = this.deps.store.get(id);
    if (!d) throw new NotFoundError("driver", id);
    return d;
  }

  list(): Driver[] {
    return this.deps.store.all();
  }

  goOnline(id: string): Driver {
    const d = this.get(id);
    if (d.status === "on_trip") throw new ConflictError("driver_on_trip", `driver ${id} is on a trip`);
    if (d.status === "available") return d;
    return this.setStatus(id, "available", null);
  }

  goOffline(id: string): Driver {
    const d = this.get(id);
    if (d.status === "on_trip") throw new ConflictError("driver_on_trip", `driver ${id} is on a trip`);
    if (d.status === "offline") return d;
    return this.setStatus(id, "offline", null);
  }

  updateLocation(id: string, pos: LatLng): Driver {
    const loc = assertLatLng(pos);
    const d = this.get(id);
    const now = this.deps.clock.now();
    const next: Driver = { ...d, location: loc, locationUpdatedAt: now };
    this.deps.store.put(next);
    this.deps.index.upsert(id, loc);
    this.emit("driver.location_updated", id, { lat: loc.lat, lng: loc.lng });
    return this.get(id);
  }

  /**
   * Low-level status change used by the trip lifecycle. Does not validate the
   * transition — callers (TripService) are responsible for that.
   */
  setStatus(id: string, status: DriverStatus, currentTripId: string | null): Driver {
    const d = this.get(id);
    const next: Driver = { ...d, status, currentTripId };
    this.deps.store.put(next);
    if (d.status !== status) this.emit("driver.status_changed", id, { from: d.status, to: status, tripId: currentTripId });
    return this.get(id);
  }

  /** Online, idle, and has pinged recently enough that we trust the location. */
  isDispatchable(d: Driver): boolean {
    if (d.status !== "available" || !d.location || d.locationUpdatedAt === null) return false;
    return this.deps.clock.now() - d.locationUpdatedAt <= this.deps.config.maxLocationAgeMs;
  }

  /** Dispatchable drivers within `radiusKm` of `center`, nearest first (ties by id). */
  findAvailableNear(center: LatLng, radiusKm = this.deps.config.searchRadiusKm, limit = Infinity): DriverCandidate[] {
    const hits = this.deps.index.queryRadius(center, radiusKm, (id) => {
      const d = this.deps.store.get(id);
      return d !== undefined && this.isDispatchable(d);
    });
    const out: DriverCandidate[] = [];
    for (const h of hits) {
      if (out.length >= limit) break;
      out.push({ driver: this.deps.store.get(h.id)!, distanceKm: h.distanceKm });
    }
    return out;
  }

  countByStatus(): Record<DriverStatus, number> {
    const counts: Record<DriverStatus, number> = { offline: 0, available: 0, on_trip: 0 };
    for (const d of this.deps.store.all()) counts[d.status]++;
    return counts;
  }

  private emit(type: "driver.registered" | "driver.status_changed" | "driver.location_updated", id: string, data: Record<string, unknown>) {
    this.deps.bus.emit({ type, at: this.deps.clock.now(), entityId: id, data });
  }
}
