import { describe, expect, it } from "testkit";
import { offset, setup, SF } from "./fixtures";
import { EventLog } from "../src/events/event-log";
import { EventBus } from "../src/shared/events";
import { IdGenerator } from "../src/shared/ids";
import { SeededRng } from "../src/shared/rng";

async function onboard() {
  const { fleet, clock } = setup();
  const dr = await fleet.call("POST", "/drivers", fleet.adminToken, {
    name: "Dee",
    vehicle: { make: "Tesla", model: "3", plate: "9TSL001", seats: 4 },
  });
  const driverToken = (dr.body as { token: string }).token;
  const driverId = (dr.body as { driver: { id: string } }).driver.id;
  await fleet.call("POST", "/drivers/me/online", driverToken);
  await fleet.call("POST", "/drivers/me/location", driverToken, offset(SF, 1));
  const rr = await fleet.call("POST", "/riders", null, { name: "Ray", phone: "+14155550199" });
  const riderToken = (rr.body as { token: string }).token;
  return { fleet, clock, driverToken, driverId, riderToken };
}

describe("API", () => {
  it("runs a full trip over HTTP", async () => {
    const { fleet, clock, driverToken, driverId, riderToken } = await onboard();
    const q = await fleet.call("POST", "/quotes", riderToken, { pickup: SF, dropoff: offset(SF, 5, 0) });
    expect(q.status).toBe(200);

    const t = await fleet.call("POST", "/trips", riderToken, { pickup: SF, dropoff: offset(SF, 5, 0) });
    expect(t.status).toBe(201);
    const { trip, dispatch } = t.body as { trip: { id: string; status: string }; dispatch: { status: string; driverId: string } };
    expect(trip.status).toBe("matched");
    expect(dispatch.driverId).toBe(driverId);

    expect((await fleet.call("POST", `/trips/${trip.id}/arrive`, driverToken)).status).toBe(200);
    expect((await fleet.call("POST", `/trips/${trip.id}/start`, driverToken)).status).toBe(200);
    clock.advanceMinutes(15);
    const done = await fleet.call("POST", `/trips/${trip.id}/complete`, driverToken, { distanceMeters: 5000, durationSec: 900 });
    expect(done.status).toBe(200);
    expect((done.body as { fare: { totalCents: number } }).fare.totalCents).toBe(1475);

    const rating = await fleet.call("POST", `/trips/${trip.id}/rating`, riderToken, { stars: 5 });
    expect(rating.status).toBe(201);

    const stmt = await fleet.call("GET", "/drivers/me/statement", driverToken);
    expect((stmt.body as { totalCents: number }).totalCents).toBe(975);
  });

  it("requires auth and the right role", async () => {
    const { fleet, riderToken } = await onboard();
    expect((await fleet.call("POST", "/quotes", null, {})).status).toBe(401);
    expect((await fleet.call("POST", "/quotes", "nope", {})).status).toBe(401);
    expect((await fleet.call("POST", "/drivers", riderToken, {})).status).toBe(403);
    expect((await fleet.call("GET", "/nowhere", riderToken)).status).toBe(404);
  });

  it("validates bodies strictly", async () => {
    const { fleet, driverToken, riderToken } = await onboard();
    const bad = await fleet.call("POST", "/drivers/me/location", driverToken, { lat: 95, lng: -122.4 });
    expect(bad.status).toBe(400);
    expect((bad.body as { error: { code: string } }).error.code).toBe("validation_error");
    expect((await fleet.call("POST", "/quotes", riderToken, { pickup: SF, dropoff: { lat: 0, lng: 181 } })).status).toBe(400);
  });

  it("cancels the trip when no driver is found", async () => {
    const { fleet, driverToken, riderToken } = await onboard();
    await fleet.call("POST", "/drivers/me/offline", driverToken);
    const t = await fleet.call("POST", "/trips", riderToken, { pickup: SF, dropoff: offset(SF, 5, 0) });
    expect((t.body as { trip: { status: string; cancelledBy: string } }).trip).toMatchObject({ status: "cancelled", cancelledBy: "system" });
  });

  it("hides trips from other riders and exposes events to admins", async () => {
    const { fleet, riderToken } = await onboard();
    const t = await fleet.call("POST", "/trips", riderToken, { pickup: SF, dropoff: offset(SF, 5, 0) });
    const id = (t.body as { trip: { id: string } }).trip.id;
    const other = await fleet.call("POST", "/riders", null, { name: "Oz", phone: "+14155550777" });
    const otherToken = (other.body as { token: string }).token;
    expect((await fleet.call("GET", `/trips/${id}`, otherToken)).status).toBe(403);
    expect((await fleet.call("GET", `/trips/${id}`, riderToken)).status).toBe(200);
    const ev = await fleet.call("GET", "/admin/events", fleet.adminToken, undefined, { entityId: id });
    expect((ev.body as unknown[]).length).toBeGreaterThan(2);
  });
});

describe("EventBus + EventLog", () => {
  it("assigns gap-free sequence numbers and drops location pings", () => {
    const bus = new EventBus();
    const log = new EventLog(bus);
    bus.emit({ type: "driver.registered", at: 1, entityId: "drv_1", data: {} });
    bus.emit({ type: "driver.location_updated", at: 2, entityId: "drv_1", data: {} });
    bus.emit({ type: "driver.status_changed", at: 3, entityId: "drv_1", data: {} });
    expect(log.query().map((e) => e.seq)).toEqual([1, 2]);
    expect(log.droppedLocationPings).toBe(1);
    expect(log.query({ afterSeq: 1 }).map((e) => e.type)).toEqual(["driver.status_changed"]);
  });

  it("isolates failing handlers", () => {
    const bus = new EventBus();
    const errors: unknown[] = [];
    bus.onHandlerError = (e) => errors.push(e);
    let seen = 0;
    bus.on("*", () => {
      throw new Error("boom");
    });
    bus.on("*", () => seen++);
    bus.emit({ type: "rider.registered", at: 0, entityId: "r", data: {} });
    expect(seen).toBe(1);
    expect(errors).toHaveLength(1);
  });
});

describe("determinism helpers", () => {
  it("ids are per-prefix and zero padded", () => {
    const ids = new IdGenerator();
    expect([ids.next("drv"), ids.next("drv"), ids.next("trp")]).toEqual(["drv_000001", "drv_000002", "trp_000001"]);
  });

  it("seeded rng is reproducible", () => {
    const a = new SeededRng(7);
    const b = new SeededRng(7);
    expect([a.next(), a.int(1, 6)]).toEqual([b.next(), b.int(1, 6)]);
  });
});
