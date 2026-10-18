import { expect, it } from "testkit";
import { createFleet } from "../../src/app";
import { FakeClock } from "../../src/shared/clock";

const SF = { lat: 37.7749, lng: -122.4194 };
const DROP = { lat: 37.81, lng: -122.4194 };
const HOUR = 3_600_000;

async function world() {
  const clock = new FakeClock();
  const fleet = createFleet({ clock });
  const dr = await fleet.call("POST", "/drivers", fleet.adminToken, { name: "D", vehicle: { make: "Kia", model: "Niro", plate: "T1", seats: 4 } });
  const { driver, token: driverToken } = dr.body as { driver: { id: string }; token: string };
  await fleet.call("POST", "/drivers/me/online", driverToken);
  let n = 0;
  const rider = async () => {
    const r = await fleet.call("POST", "/riders", null, { name: "R", phone: `+1415555${String(++n).padStart(4, "0")}` });
    return (r.body as { token: string }).token;
  };
  /** Full ride over HTTP; returns trip id. Leaves the trip at `stopAt`. */
  const ride = async (token: string, stopAt: "in_progress" | "completed" = "completed") => {
    await fleet.call("POST", "/drivers/me/location", driverToken, { lat: 37.776, lng: -122.4194 });
    const t = await fleet.call("POST", "/trips", token, { pickup: SF, dropoff: DROP });
    const id = (t.body as { trip: { id: string } }).trip.id;
    await fleet.call("POST", `/trips/${id}/arrive`, driverToken);
    await fleet.call("POST", `/trips/${id}/start`, driverToken);
    if (stopAt === "completed") {
      clock.advanceMinutes(15);
      await fleet.call("POST", `/trips/${id}/complete`, driverToken, { distanceMeters: 5000, durationSec: 900 });
    }
    return id;
  };
  return { fleet, clock, driverId: driver.id, driverToken, rider, ride };
}

it("records the tip on the trip, logs an event, and pays the driver 100%", async () => {
  const { fleet, clock, driverId, rider, ride } = await world();
  const token = await rider();
  const id = await ride(token);
  clock.advance(HOUR);
  const res = await fleet.call("POST", `/trips/${id}/tip`, token, { amountCents: 500 });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ id, tipCents: 500 });
  expect(((await fleet.call("GET", `/trips/${id}`, token)).body as { tipCents: number }).tipCents).toBe(500);
  expect(fleet.trips.get(id).fare!.totalCents).toBe(1475); // fare itself unchanged

  const events = fleet.eventLog.query({ entityId: id }).map((e) => e.type);
  expect(events).toContain("trip.tipped");

  const tips = fleet.payouts.entries(driverId).filter((e) => e.amountCents === 500);
  expect(tips).toHaveLength(1);
  expect(tips[0]).toMatchObject({ tripId: id, grossCents: 500, commissionCents: 0, at: clock.now() });
});

it("books the tip in the payout period when it was given", async () => {
  const { fleet, clock, driverId, rider, ride } = await world();
  const token = await rider();
  const id = await ride(token);
  const periodEnd = clock.now() + 1;
  expect(fleet.payouts.runPayout(driverId, periodEnd)!.amountCents).toBe(975);
  clock.advance(24 * HOUR);
  await fleet.call("POST", `/trips/${id}/tip`, token, { amountCents: 750 });
  expect(fleet.payouts.statement(driverId, periodEnd, clock.now() + 1).totalCents).toBe(750);
  expect(fleet.payouts.runPayout(driverId, clock.now() + 1)!.amountCents).toBe(750);
});

it("validates the amount, the tipper and duplicates", async () => {
  const { fleet, driverToken, rider, ride } = await world();
  const token = await rider();
  const other = await rider();
  const id = await ride(token);
  for (const amountCents of [99, 20_001, 12.5, "500", null]) {
    expect((await fleet.call("POST", `/trips/${id}/tip`, token, { amountCents })).status).toBe(400);
  }
  expect((await fleet.call("POST", `/trips/${id}/tip`, other, { amountCents: 500 })).status).toBe(403);
  expect((await fleet.call("POST", `/trips/${id}/tip`, driverToken, { amountCents: 500 })).status).toBe(403);
  expect((await fleet.call("POST", `/trips/${id}/tip`, fleet.adminToken, { amountCents: 500 })).status).toBe(403);
  expect((await fleet.call("POST", `/trips/${id}/tip`, token, { amountCents: 20_000 })).status).toBe(201);
  const again = await fleet.call("POST", `/trips/${id}/tip`, token, { amountCents: 100 });
  expect(again.status).toBe(409);
  expect((again.body as { error: { code: string } }).error.code).toBe("already_tipped");
});

it("only completed trips, within 72 hours inclusive", async () => {
  const { fleet, clock, rider, ride } = await world();
  const t1 = await rider();
  const a = await ride(t1);
  clock.advance(72 * HOUR);
  expect((await fleet.call("POST", `/trips/${a}/tip`, t1, { amountCents: 300 })).status).toBe(201);

  const t2 = await rider();
  const b = await ride(t2);
  clock.advance(72 * HOUR + 1);
  const late = await fleet.call("POST", `/trips/${b}/tip`, t2, { amountCents: 300 });
  expect((late.body as { error: { code: string } }).error.code).toBe("tip_window_closed");

  const t3 = await rider();
  const c = await ride(t3, "in_progress");
  const early = await fleet.call("POST", `/trips/${c}/tip`, t3, { amountCents: 300 });
  expect(early.status).toBe(409);
  expect((early.body as { error: { code: string } }).error.code).toBe("trip_not_completed");
});
