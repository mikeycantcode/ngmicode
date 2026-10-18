import { expect, it } from "testkit";
import { createFleet, type Fleet } from "../../src/app";
import { haversineKm } from "../../src/geo/haversine";
import type { LatLng } from "../../src/geo/latlng";
import { estimatePickupEtaSec } from "../../src/matching/eta";
import { FakeClock } from "../../src/shared/clock";
import { SeededRng } from "../../src/shared/rng";

const CENTER: LatLng = { lat: 37.7749, lng: -122.4194 };

function city(drivers: number, requests: number, seed: number, spanDeg: number) {
  const fleet = createFleet({ clock: new FakeClock() });
  const rng = new SeededRng(seed);
  const at = (): LatLng => ({ lat: CENTER.lat + rng.range(-spanDeg, spanDeg), lng: CENTER.lng + rng.range(-spanDeg, spanDeg) });
  for (let i = 0; i < drivers; i++) {
    const d = fleet.drivers.register({ name: `D${i}`, vehicle: { make: "Kia", model: "Niro", plate: `P${i}`, seats: 4 } });
    fleet.drivers.goOnline(d.id);
    fleet.drivers.updateLocation(d.id, at());
  }
  const trips: string[] = [];
  for (let i = 0; i < requests; i++) {
    const r = fleet.riders.register({ name: `R${i}`, phone: `+1415${String(1000000 + i)}` });
    const t = fleet.trips.requestTrip({ riderId: r.id, pickup: at(), dropoff: at() });
    fleet.batch.enqueue(t.id);
    trips.push(t.id);
  }
  return { fleet, trips };
}

/** Brute-force reference of the documented batch algorithm. */
function reference(fleet: Fleet, trips: string[]) {
  const cfg = fleet.config.matching;
  const drivers = fleet.drivers.list().filter((d) => fleet.drivers.isDispatchable(d));
  type P = { tripId: string; driverId: string; distanceKm: number; etaSec: number };
  const pairs: P[] = [];
  for (const tripId of trips) {
    const pickup = fleet.trips.get(tripId).pickup;
    const c = drivers
      .map((d) => ({ d, km: haversineKm(pickup, d.location!) }))
      .filter((x) => x.km <= cfg.searchRadiusKm)
      .sort((a, b) => a.km - b.km || (a.d.id < b.d.id ? -1 : 1))
      .slice(0, cfg.candidatesPerRequest);
    for (const x of c) pairs.push({ tripId, driverId: x.d.id, distanceKm: x.km, etaSec: estimatePickupEtaSec(x.km, cfg) });
  }
  pairs.sort((a, b) => a.etaSec - b.etaSec || a.distanceKm - b.distanceKm || (a.tripId < b.tripId ? -1 : a.tripId > b.tripId ? 1 : 0) || (a.driverId < b.driverId ? -1 : 1));
  const ut = new Set<string>();
  const ud = new Set<string>();
  const out: string[] = [];
  for (const p of pairs) {
    if (ut.has(p.tripId) || ud.has(p.driverId)) continue;
    ut.add(p.tripId);
    ud.add(p.driverId);
    out.push(`${p.tripId}->${p.driverId}`);
  }
  return out;
}

it("flushes a 10k-driver / 1k-request batch fast (SLO 1s; 2s CI headroom)", () => {
  const { fleet } = city(10_000, 1_000, 7, 0.2);
  const t0 = Date.now();
  const out = fleet.batch.flush();
  const elapsed = Date.now() - t0;
  expect(out.length).toBeGreaterThan(900);
  expect(elapsed).toBeLessThan(2000);
});

it("produces exactly the same assignments as the documented algorithm", () => {
  const { fleet, trips } = city(1_500, 400, 11, 0.06);
  const expected = reference(fleet, trips);
  const got = fleet.batch.flush().map((a) => `${a.tripId}->${a.driverId}`);
  expect(got).toEqual(expected);
});

it("tracks drivers that move, go offline, or stop pinging", () => {
  const fleet = createFleet({ clock: new FakeClock() });
  const clock = fleet.clock as FakeClock;
  const mk = (name: string, at: LatLng) => {
    const d = fleet.drivers.register({ name, vehicle: { make: "Kia", model: "Niro", plate: name, seats: 4 } });
    fleet.drivers.goOnline(d.id);
    fleet.drivers.updateLocation(d.id, at);
    return d;
  };
  const mover = mk("mover", { lat: 37.3, lng: -121.9 }); // San Jose, ~65 km away
  const leaver = mk("leaver", { lat: 37.7752, lng: -122.4194 });
  const sleeper = mk("sleeper", { lat: 37.7749, lng: -122.4191 });
  fleet.drivers.updateLocation(mover.id, { lat: 37.776, lng: -122.42 }); // moved into town
  fleet.drivers.updateLocation(leaver.id, { lat: 37.3, lng: -121.9 }); // left town
  clock.advance(90_000);
  fleet.drivers.updateLocation(mover.id, { lat: 37.776, lng: -122.42 });
  fleet.drivers.updateLocation(leaver.id, { lat: 37.3, lng: -121.9 });
  clock.advance(40_000); // sleeper's last ping is now 130s old -> stale
  const near = fleet.drivers.findAvailableNear(CENTER).map((c) => c.driver.id);
  expect(near).toEqual([mover.id]);
  fleet.drivers.goOffline(mover.id);
  expect(fleet.drivers.findAvailableNear(CENTER)).toEqual([]);
  expect(sleeper.id).toBeDefined();
});
