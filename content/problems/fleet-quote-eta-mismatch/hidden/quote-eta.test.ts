import { expect, it } from "testkit";
import { createFleet } from "../../src/app";
import { destinationPoint } from "../../src/geo/haversine";
import type { LatLng } from "../../src/geo/latlng";
import { FakeClock } from "../../src/shared/clock";

const SF: LatLng = { lat: 37.7749, lng: -122.4194 };
const east = (km: number) => destinationPoint(SF, 90, km);

function world() {
  const clock = new FakeClock();
  const fleet = createFleet({ clock });
  let n = 0;
  const driver = (at: LatLng) => {
    const d = fleet.drivers.register({ name: `D${++n}`, vehicle: { make: "Kia", model: "Niro", plate: `Q${n}`, seats: 4 } });
    fleet.drivers.goOnline(d.id);
    return fleet.drivers.updateLocation(d.id, at);
  };
  const rider = () => fleet.riders.register({ name: `R${++n}`, phone: `+1415777${String(n).padStart(4, "0")}` });
  const quoteThenDispatch = async () => {
    const r = rider();
    const dropoff = destinationPoint(SF, 0, 4);
    const q = fleet.quotes.quote({ riderId: r.id, pickup: SF, dropoff });
    const t = fleet.trips.requestTrip({ riderId: r.id, pickup: SF, dropoff });
    return { q, res: await fleet.dispatcher.dispatch(t.id) };
  };
  return { fleet, clock, driver, rider, quoteThenDispatch };
}

it("quotes exactly the ETA dispatch then assigns", async () => {
  const { driver, quoteThenDispatch } = world();
  driver(east(1.3));
  const { q, res } = await quoteThenDispatch();
  expect(res.status).toBe("matched");
  if (res.status === "matched") expect(q.pickupEtaSec).toBe(res.etaSec);
});

it("ignores drivers dispatch would never pick (on a trip, stale location)", async () => {
  const { fleet, clock, driver, rider, quoteThenDispatch } = world();
  const busy = driver(east(0.3));
  const r0 = rider();
  const t0 = fleet.trips.requestTrip({ riderId: r0.id, pickup: east(0.3), dropoff: east(5) });
  await fleet.dispatcher.dispatch(t0.id); // busy is now on_trip
  expect(fleet.drivers.get(busy.id).status).toBe("on_trip");
  const sleepy = driver(east(0.5));
  clock.advance(3 * 60_000); // sleepy stops pinging -> stale
  const fresh = driver(east(2.5));
  const { q, res } = await quoteThenDispatch();
  expect(res).toMatchObject({ status: "matched", driverId: fresh.id });
  if (res.status === "matched") expect(q.pickupEtaSec).toBe(res.etaSec);
  expect(sleepy.id).not.toBe(fresh.id);
});

it("returns null when nobody dispatchable is nearby", () => {
  const { fleet, clock, driver, rider } = world();
  driver(east(1));
  clock.advance(5 * 60_000);
  const r = rider();
  expect(fleet.quotes.quote({ riderId: r.id, pickup: SF, dropoff: east(4) }).pickupEtaSec).toBeNull();
});
