import { expect, it } from "testkit";
import { createFleet } from "../../src/app";
import { FakeClock } from "../../src/shared/clock";

const SF = { lat: 37.7749, lng: -122.4194 };

async function world() {
  const fleet = createFleet({ clock: new FakeClock() });
  const mkDriver = async (name: string, plate: string) => {
    const r = await fleet.call("POST", "/drivers", fleet.adminToken, { name, vehicle: { make: "Kia", model: "Niro", plate, seats: 4 } });
    const { driver, token } = r.body as { driver: { id: string }; token: string };
    await fleet.call("POST", "/drivers/me/online", token);
    return { id: driver.id, token };
  };
  const a = await mkDriver("Alice", "AAA111");
  const b = await mkDriver("Bob", "BBB222");
  await fleet.call("POST", "/drivers/me/location", a.token, { lat: 37.7759, lng: -122.4194 });
  await fleet.call("POST", "/drivers/me/location", b.token, { lat: 37.9, lng: -122.3 });
  return { fleet, a, b };
}

it("a driver cannot move another driver; ops (admin) still can", async () => {
  const { fleet, a, b } = await world();
  const spoof = await fleet.call("POST", "/drivers/me/location", b.token, { driverId: a.id, lat: 37.0, lng: -122.0 });
  expect(spoof.status).toBe(403);
  expect(fleet.drivers.get(a.id).location).toEqual({ lat: 37.7759, lng: -122.4194 });

  const own = await fleet.call("POST", "/drivers/me/location", a.token, { driverId: a.id, lat: 37.776, lng: -122.4194 });
  expect(own.status).toBe(200);

  const ops = await fleet.call("POST", "/drivers/me/location", fleet.adminToken, { driverId: a.id, lat: 37.777, lng: -122.4194 });
  expect(ops.status).toBe(200);
  expect(fleet.drivers.get(a.id).location).toEqual({ lat: 37.777, lng: -122.4194 });
});

it("a driver cannot arrive, start or complete another driver's trip", async () => {
  const { fleet, a, b } = await world();
  const rr = await fleet.call("POST", "/riders", null, { name: "Ria", phone: "+14155550123" });
  const riderToken = (rr.body as { token: string }).token;
  const tr = await fleet.call("POST", "/trips", riderToken, { pickup: SF, dropoff: { lat: 37.8, lng: -122.42 } });
  const trip = (tr.body as { trip: { id: string; driverId: string } }).trip;
  expect(trip.driverId).toBe(a.id);

  expect((await fleet.call("POST", `/trips/${trip.id}/arrive`, b.token, { driverId: a.id })).status).toBe(403);
  expect(fleet.trips.get(trip.id).status).toBe("matched");
  expect((await fleet.call("POST", `/trips/${trip.id}/arrive`, a.token)).status).toBe(200);
  expect((await fleet.call("POST", `/trips/${trip.id}/start`, b.token, { driverId: a.id })).status).toBe(403);
  expect(fleet.trips.get(trip.id).status).toBe("driver_arrived");
  expect((await fleet.call("POST", `/trips/${trip.id}/start`, a.token)).status).toBe(200);
  const steal = await fleet.call("POST", `/trips/${trip.id}/complete`, b.token, { driverId: a.id, distanceMeters: 400_000, durationSec: 3600 });
  expect(steal.status).toBe(403);
  expect(fleet.trips.get(trip.id).status).toBe("in_progress");
});

it("rejects coordinates that are not finite in-range JSON numbers", async () => {
  const { fleet, a } = await world();
  const bodies: unknown[] = [
    { lat: "37.7", lng: "-122.4" },
    { lat: null, lng: null },
    { lat: 37.7 },
    {},
    { lat: 37.7, lng: [] },
    { lat: "", lng: "" },
    { lat: 37.7, lng: true },
  ];
  for (const body of bodies) {
    const res = await fleet.call("POST", "/drivers/me/location", a.token, body);
    expect(res.status).toBe(400);
  }
  expect(fleet.drivers.get(a.id).location).toEqual({ lat: 37.7759, lng: -122.4194 });
});
