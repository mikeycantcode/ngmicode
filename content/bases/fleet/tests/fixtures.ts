import { createFleet, type Fleet, type FleetOptions } from "../src/app";
import type { Driver } from "../src/drivers/driver";
import { destinationPoint } from "../src/geo/haversine";
import type { LatLng } from "../src/geo/latlng";
import type { Rider } from "../src/riders/rider-service";
import { FakeClock } from "../src/shared/clock";

export const SF: LatLng = { lat: 37.7749, lng: -122.4194 };
export const SF_AIRPORT: LatLng = { lat: 37.6213, lng: -122.379 };

/** Point `km` away from `p` in direction `bearingDeg` (0 = north, 90 = east). */
export function offset(p: LatLng, km: number, bearingDeg = 90): LatLng {
  return destinationPoint(p, bearingDeg, km);
}

export function setup(opts: FleetOptions = {}): { fleet: Fleet; clock: FakeClock } {
  const clock = (opts.clock as FakeClock) ?? new FakeClock();
  const fleet = createFleet({ ...opts, clock });
  return { fleet, clock };
}

let phoneSeq = 0;

export function addRider(fleet: Fleet, name = "Rider"): Rider {
  phoneSeq++;
  return fleet.riders.register({ name, phone: `+1415555${String(phoneSeq).padStart(4, "0")}` });
}

export function addDriver(fleet: Fleet, at: LatLng, name = "Driver"): Driver {
  const d = fleet.drivers.register({ name, vehicle: { make: "Toyota", model: "Prius", plate: `7ABC${fleet.drivers.list().length}`, seats: 4 } });
  fleet.drivers.goOnline(d.id);
  return fleet.drivers.updateLocation(d.id, at);
}

/** Request -> dispatch -> arrive -> start -> complete. Returns the completed trip. */
export async function completeRide(
  fleet: Fleet,
  clock: FakeClock,
  riderId: string,
  opts: { pickup?: LatLng; dropoff?: LatLng; distanceMeters?: number; durationSec?: number; promoCode?: string } = {},
) {
  const pickup = opts.pickup ?? SF;
  const trip = fleet.trips.requestTrip({ riderId, pickup, dropoff: opts.dropoff ?? offset(pickup, 4, 0), promoCode: opts.promoCode });
  const res = await fleet.dispatcher.dispatch(trip.id);
  if (res.status !== "matched") throw new Error(`dispatch failed: ${res.status}`);
  clock.advanceMinutes(3);
  fleet.trips.markArrived(trip.id, res.driverId);
  clock.advanceMinutes(1);
  fleet.trips.startTrip(trip.id, res.driverId);
  clock.advanceSeconds(opts.durationSec ?? 900);
  return fleet.trips.completeTrip(trip.id, res.driverId, {
    distanceMeters: opts.distanceMeters ?? 5000,
    durationSec: opts.durationSec ?? 900,
  });
}
