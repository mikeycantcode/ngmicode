import type { FleetServices } from "../app";
import { ForbiddenError, ValidationError } from "../shared/errors";
import type { FleetEventType } from "../shared/events";
import type { Trip } from "../trips/trip";
import type { Principal } from "./auth";
import type { Router } from "./http";
import { asBody, optionalString, parseLatLng, requireInt, requireString } from "./validation";

const MAX_TRIP_METERS = 500_000;
const MAX_TRIP_SECONDS = 12 * 3600;

/** Rider of the trip, driver of the trip, or admin. */
function canView(p: Principal, trip: Trip): boolean {
  if (p.role === "admin") return true;
  if (p.role === "rider") return trip.riderId === p.id;
  return trip.driverId === p.id;
}

function parseTimeParam(raw: string | undefined, field: string, fallback: number): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new ValidationError(`${field} must be epoch ms`);
  return Number(raw);
}

export function registerRoutes(router: Router, s: FleetServices): void {
  // ---- riders ---------------------------------------------------------------
  router.add("POST", "/riders", { roles: "public", status: 201 }, ({ req }) => {
    const body = asBody(req.body);
    const rider = s.riders.register({ name: requireString(body, "name", 100), phone: requireString(body, "phone", 20) });
    return { rider, token: s.auth.issue({ role: "rider", id: rider.id }) };
  });

  // ---- drivers --------------------------------------------------------------
  router.add("POST", "/drivers", { roles: ["admin"], status: 201 }, ({ req }) => {
    const body = asBody(req.body);
    const v = asBody(body.vehicle);
    const driver = s.drivers.register({
      name: requireString(body, "name", 100),
      vehicle: {
        make: requireString(v, "make", 50),
        model: requireString(v, "model", 50),
        plate: requireString(v, "plate", 15),
        seats: requireInt(v, "seats", 1, 8),
      },
    });
    return { driver, token: s.auth.issue({ role: "driver", id: driver.id }) };
  });

  router.add("POST", "/drivers/me/online", { roles: ["driver"] }, ({ principal }) => s.drivers.goOnline(principal.id));
  router.add("POST", "/drivers/me/offline", { roles: ["driver"] }, ({ principal }) => s.drivers.goOffline(principal.id));

  router.add("POST", "/drivers/me/location", { roles: ["driver"] }, ({ req, principal }) => {
    const pos = parseLatLng(asBody(req.body), "location");
    const d = s.drivers.updateLocation(principal.id, pos);
    return { id: d.id, location: d.location, locationUpdatedAt: d.locationUpdatedAt };
  });

  router.add("GET", "/drivers/me/statement", { roles: ["driver"] }, ({ req, principal }) => {
    const now = s.clock.now();
    const to = parseTimeParam(req.query?.to, "to", now + 1); // [from, to)
    const from = parseTimeParam(req.query?.from, "from", to - 7 * 24 * 3600 * 1000);
    return s.payouts.statement(principal.id, from, to);
  });

  // ---- quotes & trips -------------------------------------------------------
  router.add("POST", "/quotes", { roles: ["rider"] }, ({ req, principal }) => {
    const body = asBody(req.body);
    return s.quotes.quote({
      riderId: principal.id,
      pickup: parseLatLng(body.pickup, "pickup"),
      dropoff: parseLatLng(body.dropoff, "dropoff"),
      promoCode: optionalString(body, "promoCode", 20),
    });
  });

  router.add("POST", "/trips", { roles: ["rider"], status: 201 }, async ({ req, principal }) => {
    const body = asBody(req.body);
    const trip = s.trips.requestTrip({
      riderId: principal.id,
      pickup: parseLatLng(body.pickup, "pickup"),
      dropoff: parseLatLng(body.dropoff, "dropoff"),
      promoCode: optionalString(body, "promoCode", 20),
    });
    const dispatch = await s.dispatcher.dispatch(trip.id);
    // TODO: move into a TripOrchestrator; the API layer shouldn't own this policy.
    if (dispatch.status === "no_drivers") s.trips.cancelTrip(trip.id, { role: "system", id: "dispatcher" });
    return { trip: s.trips.get(trip.id), dispatch };
  });

  router.add("GET", "/trips/:id", { roles: ["rider", "driver", "admin"] }, ({ params, principal }) => {
    const trip = s.trips.get(params.id);
    if (!canView(principal, trip)) throw new ForbiddenError("not your trip");
    return trip;
  });

  router.add("POST", "/trips/:id/arrive", { roles: ["driver"] }, ({ params, principal }) =>
    s.trips.markArrived(params.id, principal.id),
  );

  router.add("POST", "/trips/:id/start", { roles: ["driver"] }, ({ params, principal }) =>
    s.trips.startTrip(params.id, principal.id),
  );

  router.add("POST", "/trips/:id/complete", { roles: ["driver"] }, ({ req, params, principal }) => {
    const body = asBody(req.body);
    return s.trips.completeTrip(params.id, principal.id, {
      distanceMeters: requireInt(body, "distanceMeters", 0, MAX_TRIP_METERS),
      durationSec: requireInt(body, "durationSec", 0, MAX_TRIP_SECONDS),
    });
  });

  router.add("POST", "/trips/:id/cancel", { roles: ["rider", "driver", "admin"] }, ({ params, principal }) => {
    if (principal.role === "admin") return s.trips.cancelTrip(params.id, { role: "system", id: principal.id });
    return s.trips.cancelTrip(params.id, { role: principal.role, id: principal.id });
  });

  router.add("POST", "/trips/:id/rating", { roles: ["rider", "driver"], status: 201 }, ({ req, params, principal }) => {
    const body = asBody(req.body);
    const stars = requireInt(body, "stars", 1, 5);
    const comment = optionalString(body, "comment", 500);
    return principal.role === "rider"
      ? s.ratings.rateDriver(params.id, principal.id, stars, comment)
      : s.ratings.rateRider(params.id, principal.id, stars, comment);
  });

  // ---- admin ----------------------------------------------------------------
  router.add("GET", "/admin/events", { roles: ["admin"] }, ({ req }) => {
    const type = req.query?.type as FleetEventType | undefined;
    const entityId = req.query?.entityId;
    return s.eventLog.query({ type, entityId, limit: 500 });
  });

  router.add("POST", "/admin/surge/recompute", { roles: ["admin"] }, () => s.surge.recompute());
}
