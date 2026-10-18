import { describe, expect, it } from "testkit";
import { ConflictError, ForbiddenError, InvalidTransitionError } from "../src/shared/errors";
import { addDriver, addRider, completeRide, offset, setup, SF } from "./fixtures";

describe("trip lifecycle", () => {
  it("runs requested -> matched -> arrived -> in_progress -> completed", async () => {
    const { fleet, clock } = setup();
    const d = addDriver(fleet, offset(SF, 1));
    const r = addRider(fleet);
    const trip = await completeRide(fleet, clock, r.id);
    expect(trip.status).toBe("completed");
    expect(trip.driverId).toBe(d.id);
    expect(trip.fare!.totalCents).toBe(1475);
    expect(fleet.drivers.get(d.id).status).toBe("available");
    const types = fleet.eventLog.query({ entityId: trip.id }).map((e) => e.type);
    expect(types).toEqual([
      "trip.requested",
      "dispatch.offer_sent",
      "dispatch.offer_result",
      "trip.matched",
      "trip.driver_arrived",
      "trip.started",
      "trip.completed",
    ]);
  });

  it("rejects invalid transitions and other drivers", async () => {
    const { fleet } = setup();
    const d = addDriver(fleet, offset(SF, 1));
    const other = addDriver(fleet, offset(SF, 30));
    const r = addRider(fleet);
    const trip = fleet.trips.requestTrip({ riderId: r.id, pickup: SF, dropoff: offset(SF, 3, 0) });
    await fleet.dispatcher.dispatch(trip.id);
    expect(() => fleet.trips.startTrip(trip.id, d.id)).toThrow(InvalidTransitionError);
    expect(() => fleet.trips.markArrived(trip.id, other.id)).toThrow(ForbiddenError);
  });

  it("allows one active trip per rider", () => {
    const { fleet } = setup();
    const r = addRider(fleet);
    fleet.trips.requestTrip({ riderId: r.id, pickup: SF, dropoff: offset(SF, 3, 0) });
    expect(() => fleet.trips.requestTrip({ riderId: r.id, pickup: SF, dropoff: offset(SF, 3, 0) })).toThrow(ConflictError);
  });
});

describe("cancellation", () => {
  async function matched() {
    const ctx = setup();
    const d = addDriver(ctx.fleet, offset(SF, 1));
    const r = addRider(ctx.fleet);
    const trip = ctx.fleet.trips.requestTrip({ riderId: r.id, pickup: SF, dropoff: offset(SF, 3, 0) });
    await ctx.fleet.dispatcher.dispatch(trip.id);
    return { ...ctx, d, r, trip };
  }

  it("is free before a driver is matched", () => {
    const { fleet } = setup();
    const r = addRider(fleet);
    const trip = fleet.trips.requestTrip({ riderId: r.id, pickup: SF, dropoff: offset(SF, 3, 0) });
    expect(fleet.trips.cancelTrip(trip.id, { role: "rider", id: r.id }).cancellationFeeCents).toBe(0);
  });

  it("is free within the window after matching, then charged", async () => {
    const a = await matched();
    a.clock.advanceMinutes(2);
    expect(a.fleet.trips.cancelTrip(a.trip.id, { role: "rider", id: a.r.id }).cancellationFeeCents).toBe(0);
    expect(a.fleet.drivers.get(a.d.id).status).toBe("available");

    const b = await matched();
    b.clock.advance(2 * 60_000 + 1);
    expect(b.fleet.trips.cancelTrip(b.trip.id, { role: "rider", id: b.r.id }).cancellationFeeCents).toBe(500);
  });

  it("never charges the rider when the driver cancels", async () => {
    const a = await matched();
    a.clock.advanceMinutes(10);
    const t = a.fleet.trips.cancelTrip(a.trip.id, { role: "driver", id: a.d.id });
    expect(t.cancellationFeeCents).toBe(0);
    expect(t.cancelledBy).toBe("driver");
  });

  it("cannot cancel a trip in progress", async () => {
    const a = await matched();
    a.fleet.trips.markArrived(a.trip.id, a.d.id);
    a.fleet.trips.startTrip(a.trip.id, a.d.id);
    expect(() => a.fleet.trips.cancelTrip(a.trip.id, { role: "rider", id: a.r.id })).toThrow(InvalidTransitionError);
  });
});
