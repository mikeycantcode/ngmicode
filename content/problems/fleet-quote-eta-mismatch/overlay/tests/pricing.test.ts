import { describe, expect, it } from "testkit";
import { DEFAULT_CONFIG } from "../src/config";
import { computeFare } from "../src/pricing/fare";
import { computeDiscount, type Promo } from "../src/pricing/promos";
import { computeSurgeBps } from "../src/pricing/surge";
import { ConflictError } from "../src/shared/errors";
import { applyBps, formatCents, roundHalfUp } from "../src/shared/money";
import { addDriver, addRider, offset, setup, SF } from "./fixtures";

const P = DEFAULT_CONFIG.pricing;

describe("money", () => {
  it("rounds half away from zero", () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(applyBps(1001, 15_000)).toBe(1502);
  });
  it("formats cents", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(-5)).toBe("-$0.05");
  });
});

describe("computeFare", () => {
  it("prices a normal trip", () => {
    const f = computeFare({ distanceMeters: 5000, durationSec: 900, surgeBps: 10_000 }, P);
    expect(f).toMatchObject({ baseCents: 250, distanceCents: 600, timeCents: 450, surgeCents: 0, rideCents: 1300, bookingFeeCents: 175, totalCents: 1475 });
  });

  it("applies surge to the metered subtotal", () => {
    const f = computeFare({ distanceMeters: 5000, durationSec: 900, surgeBps: 15_000 }, P);
    expect(f.surgeCents).toBe(650);
    expect(f.totalCents).toBe(2125);
  });

  it("applies the minimum fare after surge", () => {
    const f = computeFare({ distanceMeters: 1000, durationSec: 180, surgeBps: 15_000 }, P);
    expect(f.surgeCents).toBe(230);
    expect(f.minimumFareAdjustmentCents).toBe(110);
    expect(f.rideCents).toBe(800);
    expect(f.totalCents).toBe(975);
  });

  it("discounts only the ride portion", () => {
    const promo: Promo = { code: "HALF", kind: "percent", percentBps: 5_000, maxDiscountCents: null, expiresAt: null, maxRedemptions: null };
    const f = computeFare({ distanceMeters: 5000, durationSec: 900, surgeBps: 10_000, promo }, P);
    expect(f.discountCents).toBe(650);
    expect(f.totalCents).toBe(825);
  });

  it("caps discounts", () => {
    const pct: Promo = { code: "PCT", kind: "percent", percentBps: 5_000, maxDiscountCents: 300, expiresAt: null, maxRedemptions: null };
    const flat: Promo = { code: "FLAT", kind: "flat", amountCents: 5_000, expiresAt: null, maxRedemptions: null };
    expect(computeDiscount(pct, 1300)).toBe(300);
    expect(computeDiscount(flat, 1300)).toBe(1300);
  });
});

describe("surge curve", () => {
  it("has no surge for low demand or ample supply", () => {
    expect(computeSurgeBps(2, 0)).toBe(10_000);
    expect(computeSurgeBps(10, 10)).toBe(10_000);
  });
  it("steps up by 0.25x and caps", () => {
    expect(computeSurgeBps(15, 10)).toBe(15_000);
    expect(computeSurgeBps(100, 1)).toBe(30_000);
  });
});

describe("SurgeService", () => {
  it("computes zone surge from recent requests and available drivers", () => {
    const { fleet, clock } = setup();
    addDriver(fleet, offset(SF, 0.2));
    for (let i = 0; i < 4; i++) {
      const r = addRider(fleet);
      fleet.trips.requestTrip({ riderId: r.id, pickup: SF, dropoff: offset(SF, 3, 0) });
    }
    fleet.surge.recompute();
    expect(fleet.surge.bpsAt(SF)).toBe(30_000);
    clock.advanceMinutes(11);
    fleet.surge.recompute();
    expect(fleet.surge.bpsAt(SF)).toBe(10_000);
  });

  it("locks surge on the trip at request time", () => {
    const { fleet } = setup();
    fleet.surge.setZoneBps(fleet.surge.zoneOf(SF), 12_500);
    const r = addRider(fleet);
    const t = fleet.trips.requestTrip({ riderId: r.id, pickup: SF, dropoff: offset(SF, 3, 0) });
    fleet.surge.setZoneBps(fleet.surge.zoneOf(SF), 20_000);
    expect(fleet.trips.get(t.id).surgeBps).toBe(12_500);
  });
});

describe("promos", () => {
  it("expire and are single-use per rider", () => {
    const { fleet, clock } = setup();
    fleet.promos.create({ code: "welcome10", kind: "flat", amountCents: 1000, expiresAt: clock.now() + 60_000, maxRedemptions: null });
    const r = addRider(fleet);
    expect(fleet.promos.validate("WELCOME10", r.id).code).toBe("WELCOME10");
    fleet.promos.redeem("WELCOME10", r.id);
    expect(() => fleet.promos.validate("WELCOME10", r.id)).toThrow(ConflictError);
    const r2 = addRider(fleet);
    clock.advanceMinutes(2);
    expect(() => fleet.promos.validate("WELCOME10", r2.id)).toThrow("expired");
  });
});

describe("QuoteService", () => {
  it("quotes a fare and pickup ETA", () => {
    const { fleet } = setup();
    addDriver(fleet, offset(SF, 1));
    const r = addRider(fleet);
    const q = fleet.quotes.quote({ riderId: r.id, pickup: SF, dropoff: offset(SF, 5, 0) });
    expect(q.estimatedDistanceMeters).toBe(6750);
    expect(q.estimatedFareCents).toBeGreaterThan(1000);
    expect(q.pickupEtaSec).toBeGreaterThan(0);
  });
});
