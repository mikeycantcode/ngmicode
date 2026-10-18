import { expect, it } from "testkit";
import { createFleet } from "../../src/app";
import { FakeClock } from "../../src/shared/clock";

const SF = { lat: 37.7749, lng: -122.4194 };
const DROP = { lat: 37.81, lng: -122.4194 };

async function world() {
  const clock = new FakeClock();
  const fleet = createFleet({ clock });
  const dr = await fleet.call("POST", "/drivers", fleet.adminToken, { name: "D", vehicle: { make: "Kia", model: "Niro", plate: "R1", seats: 4 } });
  const driver = dr.body as { driver: { id: string }; token: string };
  await fleet.call("POST", "/drivers/me/online", driver.token);
  await fleet.call("POST", "/drivers/me/location", driver.token, { lat: 37.776, lng: -122.4194 });
  let n = 0;
  const rider = async () => {
    const r = await fleet.call("POST", "/riders", null, { name: "R", phone: `+1415555${String(++n).padStart(4, "0")}` });
    return (r.body as { token: string }).token;
  };
  const requestTrip = async (token: string, promoCode?: string) => {
    const t = await fleet.call("POST", "/trips", token, { pickup: SF, dropoff: DROP, promoCode });
    return (t.body as { trip: { id: string } }).trip.id;
  };
  return { fleet, clock, driverToken: driver.token, rider, requestTrip };
}

it("itemizes a completed trip; amounts are cents, zero items omitted, promo negative, sums to total", async () => {
  const { fleet, clock, driverToken, rider, requestTrip } = await world();
  fleet.surge.setZoneBps(fleet.surge.zoneOf(SF), 15_000);
  fleet.promos.create({ code: "THREE", kind: "flat", amountCents: 300, expiresAt: null, maxRedemptions: null });
  const token = await rider();
  const id = await requestTrip(token, "THREE");
  await fleet.call("POST", `/trips/${id}/arrive`, driverToken);
  await fleet.call("POST", `/trips/${id}/start`, driverToken);
  clock.advanceMinutes(15);
  await fleet.call("POST", `/trips/${id}/complete`, driverToken, { distanceMeters: 5000, durationSec: 900 });

  const res = await fleet.call("GET", `/trips/${id}/receipt`, token);
  expect(res.status).toBe(200);
  const r = res.body as { tripId: string; status: string; currency: string; totalCents: number; lineItems: { code: string; label: string; amountCents: number }[] };
  expect(r).toMatchObject({ tripId: id, status: "completed", currency: "USD", totalCents: 1825 });
  expect(r.lineItems.map((i) => [i.code, i.amountCents])).toEqual([
    ["base", 250],
    ["distance", 600],
    ["time", 450],
    ["surge", 650],
    ["booking_fee", 175],
    ["promo", -300],
  ]);
  for (const i of r.lineItems) expect(typeof i.label === "string" && i.label.length > 0).toBe(true);
  expect(r.totalCents).toBe(fleet.trips.get(id).fare!.totalCents);
});

it("covers charged cancellations and refuses trips with nothing to bill", async () => {
  const { fleet, clock, rider, requestTrip } = await world();
  const token = await rider();
  const id = await requestTrip(token);
  expect((await fleet.call("GET", `/trips/${id}/receipt`, token)).status).toBe(409);
  clock.advanceMinutes(5);
  await fleet.call("POST", `/trips/${id}/cancel`, token);
  const res = await fleet.call("GET", `/trips/${id}/receipt`, token);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ status: "cancelled", totalCents: 500, lineItems: [{ code: "cancellation_fee", amountCents: 500 }] });

  const token2 = await rider();
  const id2 = await requestTrip(token2);
  await fleet.call("POST", `/trips/${id2}/cancel`, token2); // within free window
  const free = await fleet.call("GET", `/trips/${id2}/receipt`, token2);
  expect(free.status).toBe(409);
  expect((free.body as { error: { code: string } }).error.code).toBe("receipt_unavailable");
});

it("is visible only to the trip's rider and admins", async () => {
  const { fleet, clock, driverToken, rider, requestTrip } = await world();
  const owner = await rider();
  const other = await rider();
  const id = await requestTrip(owner);
  await fleet.call("POST", `/trips/${id}/arrive`, driverToken);
  await fleet.call("POST", `/trips/${id}/start`, driverToken);
  clock.advanceMinutes(10);
  await fleet.call("POST", `/trips/${id}/complete`, driverToken, { distanceMeters: 4000, durationSec: 600 });
  expect((await fleet.call("GET", `/trips/${id}/receipt`, owner)).status).toBe(200);
  expect((await fleet.call("GET", `/trips/${id}/receipt`, fleet.adminToken)).status).toBe(200);
  expect((await fleet.call("GET", `/trips/${id}/receipt`, other)).status).toBe(403);
  expect((await fleet.call("GET", `/trips/${id}/receipt`, driverToken)).status).toBe(403);
  expect((await fleet.call("GET", `/trips/trp_999999/receipt`, owner)).status).toBe(404);
});
