import { expect, it } from "testkit";
import { createFleet } from "../../src/app";
import { destinationPoint } from "../../src/geo/haversine";
import type { LatLng } from "../../src/geo/latlng";
import { FakeClock } from "../../src/shared/clock";

const SF: LatLng = { lat: 37.7749, lng: -122.4194 };

async function arrivedTrip(opts: { surgeBps?: number; promo?: boolean } = {}) {
  const clock = new FakeClock();
  const fleet = createFleet({ clock });
  const d = fleet.drivers.register({ name: "D", vehicle: { make: "Kia", model: "Niro", plate: "W1", seats: 4 } });
  fleet.drivers.goOnline(d.id);
  fleet.drivers.updateLocation(d.id, destinationPoint(SF, 90, 1));
  if (opts.surgeBps) fleet.surge.setZoneBps(fleet.surge.zoneOf(SF), opts.surgeBps);
  if (opts.promo) fleet.promos.create({ code: "HALF", kind: "percent", percentBps: 5_000, maxDiscountCents: null, expiresAt: null, maxRedemptions: null });
  const r = fleet.riders.register({ name: "R", phone: "+14155550100" });
  const trip = fleet.trips.requestTrip({ riderId: r.id, pickup: SF, dropoff: destinationPoint(SF, 0, 4), promoCode: opts.promo ? "HALF" : null });
  await fleet.dispatcher.dispatch(trip.id);
  clock.advanceMinutes(3);
  fleet.trips.markArrived(trip.id, d.id);
  return { fleet, clock, trip, driverId: d.id, riderId: r.id };
}

it("charges 40c per full minute beyond 2 free minutes, never surged", async () => {
  const { fleet, clock, trip, driverId } = await arrivedTrip({ surgeBps: 15_000 });
  clock.advanceSeconds(330); // 5m30s wait -> 3 billable minutes
  fleet.trips.startTrip(trip.id, driverId);
  clock.advanceMinutes(15);
  const done = fleet.trips.completeTrip(trip.id, driverId, { distanceMeters: 5000, durationSec: 900 });
  expect(done.fare!.waitingCents).toBe(120);
  expect(done.fare!.rideCents).toBe(1950);
  expect(done.fare!.totalCents).toBe(1950 + 175 + 120);
});

it("is added after the minimum fare and is not discounted by promos", async () => {
  const { fleet, clock, trip, driverId } = await arrivedTrip({ promo: true });
  clock.advanceMinutes(4); // 2 billable minutes
  fleet.trips.startTrip(trip.id, driverId);
  clock.advanceMinutes(3);
  const f = fleet.trips.completeTrip(trip.id, driverId, { distanceMeters: 1000, durationSec: 180 }).fare!;
  expect(f.minimumFareAdjustmentCents).toBe(340);
  expect(f.rideCents).toBe(800);
  expect(f.discountCents).toBe(400);
  expect(f.waitingCents).toBe(80);
  expect(f.totalCents).toBe(800 + 175 + 80 - 400);
});

it("goes 100% to the driver (no commission on waiting)", async () => {
  const { fleet, clock, trip, driverId } = await arrivedTrip();
  clock.advanceSeconds(330);
  fleet.trips.startTrip(trip.id, driverId);
  clock.advanceMinutes(15);
  fleet.trips.completeTrip(trip.id, driverId, { distanceMeters: 5000, durationSec: 900 });
  const stmt = fleet.payouts.statement(driverId, 0, clock.now() + 1);
  expect(stmt.totalCents).toBe(1300 - 325 + 120);
});

it("is added to the cancellation fee when the rider cancels after the driver arrived", async () => {
  const a = await arrivedTrip();
  a.clock.advanceSeconds(250); // 4m10s -> 2 billable minutes
  expect(a.fleet.trips.cancelTrip(a.trip.id, { role: "rider", id: a.riderId }).cancellationFeeCents).toBe(580);
  const b = await arrivedTrip();
  b.clock.advanceMinutes(1);
  expect(b.fleet.trips.cancelTrip(b.trip.id, { role: "rider", id: b.riderId }).cancellationFeeCents).toBe(500);
});
