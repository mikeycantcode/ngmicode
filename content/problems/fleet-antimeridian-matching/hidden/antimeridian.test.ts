import { expect, it } from "testkit";
import { createFleet } from "../../src/app";
import type { LatLng } from "../../src/geo/latlng";
import { FakeClock } from "../../src/shared/clock";

function world() {
  const fleet = createFleet({ clock: new FakeClock() });
  let n = 0;
  const driver = (at: LatLng) => {
    const d = fleet.drivers.register({ name: `D${++n}`, vehicle: { make: "Toyota", model: "Corolla", plate: `FJ${n}`, seats: 4 } });
    fleet.drivers.goOnline(d.id);
    fleet.drivers.updateLocation(d.id, at);
    return d;
  };
  const request = (pickup: LatLng) => {
    const r = fleet.riders.register({ name: `R${++n}`, phone: `+67990000${String(n).padStart(2, "0")}` });
    return fleet.trips.requestTrip({ riderId: r.id, pickup, dropoff: { lat: pickup.lat + 0.02, lng: pickup.lng } });
  };
  return { fleet, driver, request };
}

it("matches an east-side rider with a driver just west of the date line", async () => {
  const { fleet, driver, request } = world();
  const d = driver({ lat: -16.8, lng: 179.995 });
  const trip = request({ lat: -16.8, lng: -179.995 });
  const res = await fleet.dispatcher.dispatch(trip.id);
  expect(res.status).toBe("matched");
  if (res.status !== "matched") return;
  expect(res.driverId).toBe(d.id);
  expect(res.etaSec).toBeLessThan(400); // ~1.1 km away
});

it("works in the other direction too", async () => {
  const { fleet, driver, request } = world();
  const d = driver({ lat: -16.8, lng: -179.995 });
  const trip = request({ lat: -16.8, lng: 179.995 });
  const res = await fleet.dispatcher.dispatch(trip.id);
  expect(res).toMatchObject({ status: "matched", driverId: d.id });
});

it("picks the genuinely nearest driver across the line, and quote agrees with dispatch", async () => {
  const { fleet, driver, request } = world();
  const near = driver({ lat: -16.8, lng: 179.99 }); // ~1.6 km west, across the line
  driver({ lat: -16.8, lng: -179.97 }); // ~2.7 km east
  const pickup = { lat: -16.8, lng: -179.995 };
  const q = fleet.quotes.quote({ riderId: "rdr_x", pickup, dropoff: { lat: -16.78, lng: -179.995 } });
  const trip = request(pickup);
  const res = await fleet.dispatcher.dispatch(trip.id);
  expect(res).toMatchObject({ status: "matched", driverId: near.id });
  if (res.status === "matched") expect(q.pickupEtaSec).toBe(res.etaSec);
});
