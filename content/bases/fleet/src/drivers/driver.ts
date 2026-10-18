import type { LatLng } from "../geo/latlng";

/**
 * offline   – not taking trips
 * available – online and dispatchable (if their location is fresh)
 * on_trip   – assigned to a trip (en route to pickup, waiting, or driving)
 */
export type DriverStatus = "offline" | "available" | "on_trip";

export interface Vehicle {
  make: string;
  model: string;
  plate: string;
  seats: number;
}

export interface Driver {
  id: string;
  name: string;
  vehicle: Vehicle;
  status: DriverStatus;
  location: LatLng | null;
  /** epoch ms of the last location ping, null if never pinged */
  locationUpdatedAt: number | null;
  /** trip currently assigned, if status === "on_trip" */
  currentTripId: string | null;
  createdAt: number;
}

export interface DriverCandidate {
  driver: Driver;
  distanceKm: number;
}

/**
 * Stores hold immutable snapshots. To change a driver, build a new object
 * and `put` it — never mutate what `get` returned.
 */
export interface DriverStore {
  get(id: string): Driver | undefined;
  put(driver: Driver): void;
  all(): Driver[];
  size(): number;
}

export class InMemoryDriverStore implements DriverStore {
  private readonly rows = new Map<string, Driver>();

  get(id: string): Driver | undefined {
    return this.rows.get(id);
  }

  put(driver: Driver): void {
    this.rows.set(driver.id, Object.freeze({ ...driver }) as Driver);
  }

  all(): Driver[] {
    return [...this.rows.values()];
  }

  size(): number {
    return this.rows.size;
  }
}
