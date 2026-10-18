import { expect, it } from "testkit";
import { createFleet } from "../../src/app";
import { destinationPoint } from "../../src/geo/haversine";
import type { LatLng } from "../../src/geo/latlng";
import { FakeClock } from "../../src/shared/clock";

type Outcome = "accepted" | "declined" | "timeout";

/** Offers stay pending until the test answers them. */
class ManualGateway {
  pending: Array<{ driverId: string; tripId: string; answer: (o: Outcome) => void }> = [];
  offer(driverId: string, tripId: string): Promise<Outcome> {
    return new Promise((resolve) => this.pending.push({ driverId, tripId, answer: resolve }));
  }
}

const SF: LatLng = { lat: 37.7749, lng: -122.4194 };
const east = (km: number) => destinationPoint(SF, 90, km);
const tick = () => new Promise((r) => setTimeout(r, 0));

function world(offers?: ManualGateway) {
  const fleet = createFleet({ clock: new FakeClock(), offers });
  let n = 0;
  const driver = (at: LatLng) => {
    const d = fleet.drivers.register({ name: `D${++n}`, vehicle: { make: "Kia", model: "Niro", plate: `C${n}`, seats: 4 } });
    fleet.drivers.goOnline(d.id);
    return fleet.drivers.updateLocation(d.id, at);
  };
  const request = () => {
    const r = fleet.riders.register({ name: `R${++n}`, phone: `+1415888${String(n).padStart(4, "0")}` });
    return fleet.trips.requestTrip({ riderId: r.id, pickup: SF, dropoff: east(4) });
  };
  return { fleet, driver, request };
}

it("two simultaneous requests never get the same driver", async () => {
  const { fleet, driver, request } = world();
  const near = driver(east(0.5));
  const far = driver(east(2));
  const t1 = request();
  const t2 = request();
  const [r1, r2] = await Promise.all([fleet.dispatcher.dispatch(t1.id), fleet.dispatcher.dispatch(t2.id)]);
  expect(r1.status).toBe("matched");
  expect(r2.status).toBe("matched");
  const ids = [r1, r2].map((r) => (r.status === "matched" ? r.driverId : ""));
  expect(new Set(ids).size).toBe(2);
  expect(fleet.drivers.get(near.id).currentTripId).toBe(fleet.trips.get(t1.id).driverId === near.id ? t1.id : t2.id);
  expect(fleet.drivers.get(far.id).status).toBe("on_trip");
});

it("with one driver and two requests, exactly one is matched and the other resolves no_drivers", async () => {
  const { fleet, driver, request } = world();
  const only = driver(east(0.5));
  const t1 = request();
  const t2 = request();
  const results = await Promise.all([fleet.dispatcher.dispatch(t1.id), fleet.dispatcher.dispatch(t2.id)]);
  const matched = results.filter((r) => r.status === "matched");
  expect(matched).toHaveLength(1);
  expect(results.filter((r) => r.status === "no_drivers")).toHaveLength(1);
  const winner = matched[0].tripId;
  expect(fleet.drivers.get(only.id).currentTripId).toBe(winner);
  expect(fleet.trips.get(winner === t1.id ? t2.id : t1.id).driverId).toBeNull();
});

it("a driver with an outstanding offer is skipped, and released again on decline", async () => {
  const gw = new ManualGateway();
  const { fleet, driver, request } = world(gw);
  const d = driver(east(0.5));
  const t1 = request();
  const p1 = fleet.dispatcher.dispatch(t1.id);
  await tick();
  expect(gw.pending.map((o) => o.driverId)).toEqual([d.id]);

  const t2 = request();
  const p2 = fleet.dispatcher.dispatch(t2.id);
  await tick();
  expect(gw.pending).toHaveLength(1); // not offered twice
  expect(await p2).toEqual({ status: "no_drivers", tripId: t2.id });

  gw.pending[0].answer("declined");
  expect(await p1).toEqual({ status: "no_drivers", tripId: t1.id });
  expect(fleet.drivers.findAvailableNear(SF).map((c) => c.driver.id)).toEqual([d.id]);
});

it("if the rider cancels while the offer is pending, the trip stays cancelled and the driver is freed", async () => {
  const gw = new ManualGateway();
  const { fleet, driver, request } = world(gw);
  const d = driver(east(0.5));
  const t1 = request();
  const p1 = fleet.dispatcher.dispatch(t1.id);
  await tick();
  const cancelled = fleet.trips.cancelTrip(t1.id, { role: "rider", id: t1.riderId });
  expect(cancelled.cancellationFeeCents).toBe(0);
  gw.pending[0].answer("accepted");
  expect(await p1).toEqual({ status: "cancelled", tripId: t1.id });
  expect(fleet.trips.get(t1.id)).toMatchObject({ status: "cancelled", driverId: null });
  expect(fleet.drivers.get(d.id)).toMatchObject({ status: "available", currentTripId: null });
  expect(fleet.drivers.findAvailableNear(SF)).toHaveLength(1);
});
