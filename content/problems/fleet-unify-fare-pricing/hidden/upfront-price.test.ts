import { expect, it } from "testkit";
import { createFleet } from "../../src/app";
import type { LatLng } from "../../src/geo/latlng";
import { FakeClock } from "../../src/shared/clock";

const SF: LatLng = { lat: 37.7749, lng: -122.4194 };

/** Quote, request, and complete a trip that goes exactly as estimated. */
async function asEstimated(dropoff: LatLng, opts: { surgeBps?: number; promo?: "pct" | "flat" } = {}) {
  const clock = new FakeClock();
  const fleet = createFleet({ clock });
  const d = fleet.drivers.register({ name: "D", vehicle: { make: "Kia", model: "Niro", plate: "U1", seats: 4 } });
  fleet.drivers.goOnline(d.id);
  fleet.drivers.updateLocation(d.id, { lat: 37.776, lng: -122.4194 });
  if (opts.surgeBps) fleet.surge.setZoneBps(fleet.surge.zoneOf(SF), opts.surgeBps);
  if (opts.promo === "pct") fleet.promos.create({ code: "SAVE20", kind: "percent", percentBps: 2_000, maxDiscountCents: 1_000, expiresAt: null, maxRedemptions: null });
  if (opts.promo === "flat") fleet.promos.create({ code: "SAVE20", kind: "flat", amountCents: 2_000, expiresAt: null, maxRedemptions: null });
  const r = fleet.riders.register({ name: "R", phone: "+14155550100" });
  const promoCode = opts.promo ? "SAVE20" : null;
  const q = fleet.quotes.quote({ riderId: r.id, pickup: SF, dropoff, promoCode });
  const trip = fleet.trips.requestTrip({ riderId: r.id, pickup: SF, dropoff, promoCode });
  await fleet.dispatcher.dispatch(trip.id);
  fleet.trips.markArrived(trip.id, d.id);
  fleet.trips.startTrip(trip.id, d.id);
  clock.advanceSeconds(q.estimatedDurationSec);
  const done = fleet.trips.completeTrip(trip.id, d.id, { distanceMeters: q.estimatedDistanceMeters, durationSec: q.estimatedDurationSec });
  return { quoted: q.estimatedFareCents, upfront: trip.quotedFareCents, charged: done.fare!.totalCents };
}

it("short surged trip: quote, upfront price and final charge agree", async () => {
  const r = await asEstimated({ lat: 37.7812, lng: -122.4194 }, { surgeBps: 15_000 });
  expect(r.charged).toBe(975);
  expect(r.quoted).toBe(r.charged);
  expect(r.upfront).toBe(r.charged);
});

it("promo trips agree (percent and flat promos)", async () => {
  for (const promo of ["pct", "flat"] as const) {
    const r = await asEstimated({ lat: 37.81, lng: -122.43 }, { promo, surgeBps: 12_500 });
    expect(r.quoted).toBe(r.charged);
    expect(r.upfront).toBe(r.charged);
  }
});

it("plain trips still agree and final fares are unchanged", async () => {
  const r = await asEstimated({ lat: 37.80, lng: -122.40 });
  expect(r.quoted).toBe(r.charged);
  expect(r.upfront).toBe(r.charged);
});
