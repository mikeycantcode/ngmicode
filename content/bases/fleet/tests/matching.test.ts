import { describe, expect, it } from "testkit";
import { DEFAULT_CONFIG } from "../src/config";
import { estimatePickupEtaSec } from "../src/matching/eta";
import { ScriptedGateway } from "../src/matching/dispatcher";
import { addDriver, addRider, offset, setup, SF } from "./fixtures";

describe("ETA model", () => {
  it("is overhead + road distance at average speed, rounded up", () => {
    // 1km * 1.35 / 28 km/h = 173.57s + 60s
    expect(estimatePickupEtaSec(1, DEFAULT_CONFIG.matching)).toBe(234);
    expect(estimatePickupEtaSec(0, DEFAULT_CONFIG.matching)).toBe(60);
  });
});

describe("Dispatcher", () => {
  it("assigns the nearest available driver", async () => {
    const { fleet } = setup();
    addDriver(fleet, offset(SF, 2));
    const near = addDriver(fleet, offset(SF, 0.5));
    const r = addRider(fleet);
    const trip = fleet.trips.requestTrip({ riderId: r.id, pickup: SF, dropoff: offset(SF, 3, 0) });
    const res = await fleet.dispatcher.dispatch(trip.id);
    expect(res).toMatchObject({ status: "matched", driverId: near.id });
    expect(fleet.trips.get(trip.id)).toMatchObject({ status: "matched", driverId: near.id, pickupEtaSec: res.status === "matched" ? res.etaSec : -1 });
  });

  it("moves on to the next driver after a decline", async () => {
    const gw = new ScriptedGateway({ drv_000002: ["declined"] });
    const { fleet } = setup({ offers: gw });
    const second = addDriver(fleet, offset(SF, 2));
    addDriver(fleet, offset(SF, 0.5)); // drv_000002, declines
    const r = addRider(fleet);
    const trip = fleet.trips.requestTrip({ riderId: r.id, pickup: SF, dropoff: offset(SF, 3, 0) });
    const res = await fleet.dispatcher.dispatch(trip.id);
    expect(res).toMatchObject({ status: "matched", driverId: second.id });
    expect(gw.sent.map((s) => s.driverId)).toEqual(["drv_000002", "drv_000001"]);
  });

  it("gives up when nobody is nearby", async () => {
    const { fleet } = setup();
    addDriver(fleet, offset(SF, 50));
    const r = addRider(fleet);
    const trip = fleet.trips.requestTrip({ riderId: r.id, pickup: SF, dropoff: offset(SF, 3, 0) });
    expect(await fleet.dispatcher.dispatch(trip.id)).toEqual({ status: "no_drivers", tripId: trip.id });
  });
});

describe("BatchDispatcher", () => {
  it("assigns greedily by global ETA and keeps leftovers queued", () => {
    const { fleet } = setup();
    const d1 = addDriver(fleet, offset(SF, 0.2));
    const r1 = addRider(fleet);
    const r2 = addRider(fleet);
    const pA = offset(SF, 0.5, 0);
    const pB = offset(SF, 0.1, 180);
    const tA = fleet.trips.requestTrip({ riderId: r1.id, pickup: pA, dropoff: offset(SF, 3, 0) });
    const tB = fleet.trips.requestTrip({ riderId: r2.id, pickup: pB, dropoff: offset(SF, 3, 0) });
    fleet.batch.enqueue(tA.id);
    fleet.batch.enqueue(tB.id);
    const out = fleet.batch.flush();
    expect(out.map((a) => [a.tripId, a.driverId])).toEqual([[tB.id, d1.id]]);
    expect(fleet.batch.pendingCount()).toBe(1);
    const d2 = addDriver(fleet, pA);
    expect(fleet.batch.flush().map((a) => [a.tripId, a.driverId])).toEqual([[tA.id, d2.id]]);
  });
});
