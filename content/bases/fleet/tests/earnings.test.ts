import { describe, expect, it } from "testkit";
import { ConflictError, ForbiddenError, ValidationError } from "../src/shared/errors";
import { addDriver, addRider, completeRide, offset, setup, SF } from "./fixtures";

describe("PayoutService", () => {
  it("takes commission on the pre-promo ride fare", async () => {
    const { fleet, clock } = setup();
    const d = addDriver(fleet, offset(SF, 1));
    fleet.promos.create({ code: "FIVE", kind: "flat", amountCents: 500, expiresAt: null, maxRedemptions: null });
    const r = addRider(fleet);
    const trip = await completeRide(fleet, clock, r.id, { promoCode: "FIVE" });
    expect(trip.fare!.totalCents).toBe(975);
    const [entry] = fleet.payouts.entries(d.id);
    expect(entry).toMatchObject({ kind: "trip_earnings", grossCents: 1300, commissionCents: 325, amountCents: 975 });
  });

  it("shares late cancellation fees with the driver", async () => {
    const { fleet, clock } = setup();
    const d = addDriver(fleet, offset(SF, 1));
    const r = addRider(fleet);
    const trip = fleet.trips.requestTrip({ riderId: r.id, pickup: SF, dropoff: offset(SF, 3, 0) });
    await fleet.dispatcher.dispatch(trip.id);
    clock.advanceMinutes(5);
    fleet.trips.cancelTrip(trip.id, { role: "rider", id: r.id });
    expect(fleet.payouts.entries(d.id)).toHaveLength(1);
    expect(fleet.payouts.entries(d.id)[0]).toMatchObject({ kind: "cancellation_fee", grossCents: 500, amountCents: 400 });
  });

  it("builds statements over [from, to) and pays out idempotently", async () => {
    const { fleet, clock } = setup();
    const d = addDriver(fleet, offset(SF, 1));
    const start = clock.now();
    await completeRide(fleet, clock, addRider(fleet).id);
    fleet.drivers.updateLocation(d.id, offset(SF, 1));
    const mid = clock.now() + 1;
    clock.advanceMinutes(30);
    fleet.drivers.updateLocation(d.id, offset(SF, 1));
    await completeRide(fleet, clock, addRider(fleet).id);
    expect(fleet.payouts.statement(d.id, start, mid).entries).toHaveLength(1);
    expect(fleet.payouts.statement(d.id, start, clock.now() + 1).totalCents).toBe(975 * 2);

    const p1 = fleet.payouts.runPayout(d.id, mid);
    expect(p1!.amountCents).toBe(975);
    expect(fleet.payouts.runPayout(d.id, mid)).toBeNull();
    expect(fleet.payouts.runPayout(d.id, clock.now() + 1)!.amountCents).toBe(975);
  });
});


describe("RatingService", () => {
  it("lets the rider rate the driver once", async () => {
    const { fleet, clock } = setup();
    const d = addDriver(fleet, offset(SF, 1));
    const r = addRider(fleet);
    const trip = await completeRide(fleet, clock, r.id);
    fleet.ratings.rateDriver(trip.id, r.id, 4, "nice car");
    expect(fleet.ratings.average(d.id)).toEqual({ average: 4, count: 1 });
    expect(() => fleet.ratings.rateDriver(trip.id, r.id, 5)).toThrow(ConflictError);
  });

  it("validates stars and ownership", async () => {
    const { fleet, clock } = setup();
    addDriver(fleet, offset(SF, 1));
    const r = addRider(fleet);
    const stranger = addRider(fleet);
    const trip = await completeRide(fleet, clock, r.id);
    expect(() => fleet.ratings.rateDriver(trip.id, r.id, 6)).toThrow(ValidationError);
    expect(() => fleet.ratings.rateDriver(trip.id, stranger.id, 5)).toThrow(ForbiddenError);
  });

  it("averages to two decimals", async () => {
    const { fleet, clock } = setup();
    const d = addDriver(fleet, offset(SF, 1));
    for (const stars of [5, 4, 4]) {
      fleet.drivers.updateLocation(d.id, offset(SF, 1));
      const r = addRider(fleet);
      const trip = await completeRide(fleet, clock, r.id);
      fleet.ratings.rateDriver(trip.id, r.id, stars);
    }
    expect(fleet.ratings.average(d.id).average).toBe(4.33);
  });
});
