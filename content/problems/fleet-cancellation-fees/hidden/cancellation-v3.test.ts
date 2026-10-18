import { expect, it } from "testkit";
import { DEFAULT_CONFIG } from "../../src/config";
import { InvalidTransitionError } from "../../src/shared/errors";
import { computeCancellationFee } from "../../src/trips/cancellation";
import type { Trip } from "../../src/trips/trip";

const CFG = DEFAULT_CONFIG.trips;
const MIN = 60_000;

function trip(over: Partial<Trip>): Trip {
  return {
    id: "trp_000001", riderId: "rdr_000001", driverId: "drv_000001", status: "matched",
    pickup: { lat: 37.77, lng: -122.42 }, dropoff: { lat: 37.8, lng: -122.42 },
    surgeBps: 10_000, promoCode: null, quotedFareCents: 1500, pickupEtaSec: 300,
    requestedAt: 0, matchedAt: 0, arrivedAt: null, startedAt: null, completedAt: null,
    cancelledAt: null, cancelledBy: null, cancellationFeeCents: 0,
    distanceMeters: null, durationSec: null, fare: null, ...over,
  } as Trip;
}

it("matched: inclusive free window, then flat fee scaled by surge", () => {
  expect(computeCancellationFee(trip({}), "rider", 2 * MIN, CFG)).toBe(0);
  expect(computeCancellationFee(trip({}), "rider", 2 * MIN + 1, CFG)).toBe(500);
  expect(computeCancellationFee(trip({ surgeBps: 15_000 }), "rider", 3 * MIN, CFG)).toBe(750);
  expect(computeCancellationFee(trip({ surgeBps: 12_345 }), "rider", 3 * MIN, CFG)).toBe(617);
});

it("matched: waived only when the driver is MORE than 5 minutes past the quoted ETA", () => {
  // ETA 300s -> late threshold is matchedAt + 300s + 300s = 600_000
  expect(computeCancellationFee(trip({}), "rider", 600_000, CFG)).toBe(500);
  expect(computeCancellationFee(trip({}), "rider", 600_001, CFG)).toBe(0);
  expect(computeCancellationFee(trip({ pickupEtaSec: null }), "rider", 60 * MIN, CFG)).toBe(500);
});

it("driver_arrived: fee plus 50c per full minute beyond 2, surged, then capped at 1500", () => {
  const arrived = (waitMs: number, surgeBps = 10_000) =>
    computeCancellationFee(trip({ status: "driver_arrived", arrivedAt: 10 * MIN, surgeBps }), "rider", 10 * MIN + waitMs, CFG);
  expect(arrived(2 * MIN)).toBe(500);
  expect(arrived(4 * MIN + 59_000)).toBe(600);
  expect(arrived(4 * MIN + 59_000, 12_500)).toBe(750);
  expect(arrived(30 * MIN)).toBe(1500);
  expect(arrived(10 * MIN, 15_000)).toBe(1350); // (500 + 400) * 1.5
  expect(arrived(15 * MIN, 15_000)).toBe(1500); // (500 + 650) * 1.5 = 1725 -> capped AFTER surge
  expect(arrived(8 * MIN, 15_000)).toBe(1200); // (500 + 300) * 1.5
});

it("keeps the non-rider and status rules", () => {
  expect(computeCancellationFee(trip({}), "driver", 30 * MIN, CFG)).toBe(0);
  expect(computeCancellationFee(trip({ status: "driver_arrived", arrivedAt: 0 }), "system", 30 * MIN, CFG)).toBe(0);
  expect(computeCancellationFee(trip({ status: "requested", driverId: null, matchedAt: null }), "rider", 30 * MIN, CFG)).toBe(0);
  expect(() => computeCancellationFee(trip({ status: "in_progress" }), "rider", 0, CFG)).toThrow(InvalidTransitionError);
});
