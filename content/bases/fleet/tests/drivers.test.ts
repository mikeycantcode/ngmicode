import { describe, expect, it } from "testkit";
import { ConflictError, ValidationError } from "../src/shared/errors";
import { addDriver, addRider, offset, setup, SF } from "./fixtures";

describe("DriverRegistry", () => {
  it("registers drivers offline with no location", () => {
    const { fleet } = setup();
    const d = fleet.drivers.register({ name: " Ana ", vehicle: { make: "Kia", model: "Niro", plate: "8XYZ123", seats: 4 } });
    expect(d).toMatchObject({ id: "drv_000001", name: "Ana", status: "offline", location: null });
  });

  it("finds available drivers nearest first", () => {
    const { fleet } = setup();
    const far = addDriver(fleet, offset(SF, 3));
    const near = addDriver(fleet, offset(SF, 1));
    const hits = fleet.drivers.findAvailableNear(SF);
    expect(hits.map((h) => h.driver.id)).toEqual([near.id, far.id]);
    expect(hits[0].distanceKm).toBeCloseTo(1, 3);
  });

  it("excludes offline drivers and drivers with stale locations", () => {
    const { fleet, clock } = setup();
    const a = addDriver(fleet, offset(SF, 1));
    const b = addDriver(fleet, offset(SF, 2));
    fleet.drivers.goOffline(a.id);
    expect(fleet.drivers.findAvailableNear(SF).map((h) => h.driver.id)).toEqual([b.id]);
    clock.advanceMinutes(3);
    expect(fleet.drivers.findAvailableNear(SF)).toHaveLength(0);
    fleet.drivers.updateLocation(b.id, offset(SF, 2));
    expect(fleet.drivers.findAvailableNear(SF)).toHaveLength(1);
  });

  it("excludes drivers on a trip and blocks going offline mid-trip", async () => {
    const { fleet } = setup();
    const d = addDriver(fleet, offset(SF, 1));
    const r = addRider(fleet);
    const trip = fleet.trips.requestTrip({ riderId: r.id, pickup: SF, dropoff: offset(SF, 5, 0) });
    await fleet.dispatcher.dispatch(trip.id);
    expect(fleet.drivers.get(d.id).status).toBe("on_trip");
    expect(fleet.drivers.findAvailableNear(SF)).toHaveLength(0);
    expect(() => fleet.drivers.goOffline(d.id)).toThrow(ConflictError);
  });

  it("rejects invalid coordinates", () => {
    const { fleet } = setup();
    const d = addDriver(fleet, SF);
    expect(() => fleet.drivers.updateLocation(d.id, { lat: 120, lng: 0 })).toThrow(ValidationError);
  });

  it("returns frozen snapshots", () => {
    const { fleet } = setup();
    const d = addDriver(fleet, SF);
    expect(Object.isFrozen(fleet.drivers.get(d.id))).toBe(true);
  });
});
