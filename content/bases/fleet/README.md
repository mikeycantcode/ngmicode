# fleet — ride-hailing dispatch backend

`fleet` is the dispatch core of our ride-hailing product. It tracks drivers, accepts trip
requests from riders, matches riders to drivers, prices trips, and keeps the driver
earnings ledger. It is a single in-process TypeScript service. Storage is in-memory
behind store interfaces; production swaps in Postgres/Redis adapters that are not in this repo.

## Layout

```
src/
  app.ts                  composition root: createFleet() wires everything
  config.ts               all tunables (pricing, surge, matching, cancellation, payouts)
  shared/                 clock, seeded rng, ids, errors (+ Result), money, event bus, logger
  geo/
    latlng.ts             LatLng type + validation, service areas
    haversine.ts          great-circle distance, bearings, destination point
    geohash.ts            geohash encode/decode (surge zones)
    grid-index.ts         uniform lat/lng grid spatial index (nearby-driver search)
  drivers/                Driver model + store, DriverRegistry (status, location pings, nearby search)
  riders/                 RiderService
  trips/
    trip.ts               Trip model, statuses, store
    trip-state.ts         allowed status transitions
    trip-service.ts       lifecycle: request, assign, arrive, start, complete, cancel
    cancellation.ts       rider cancellation-fee policy
  matching/
    eta.ts                THE ETA model (pickup ETA, trip distance/duration estimates)
    matcher.ts            ranks candidate drivers for one pickup
    dispatcher.ts         real-time dispatch: offer -> await accept/decline -> next driver
    batch-dispatcher.ts   batch matching for high-demand windows (greedy by global ETA)
  pricing/
    fare.ts               canonical fare computation (FareBreakdown)
    surge.ts              surge curve + per-zone surge service
    promos.ts             promo codes and redemption
    quote-service.ts      upfront price + pickup ETA for the confirm screen
    legacy-fare.ts        deprecated v1 fare math (still used for upfront prices)
  payouts/                driver earnings ledger, statements, payout runs
  ratings/                rider <-> driver ratings
  events/event-log.ts     append-only audit log of all domain events
  api/                    HTTP-shaped layer: router/server, token auth, validation, route handlers
tests/                    visible test suite (run them!)
```

## Trip lifecycle

```
requested ──► matched ──► driver_arrived ──► in_progress ──► completed
    │            │               │
    └────────────┴───────────────┴──────────► cancelled
```

The driver is `on_trip` from `matched` until the trip completes or is cancelled. Then the
driver goes back to `available`.

## Conventions (please keep them)

- **Money is integer cents** (`Cents`). **Multipliers are integer basis points** (`Bps`):
  `10_000` = 1.0x. Use `applyBps` / `roundHalfUp` from `shared/money.ts`. Never use float dollars.
  The one exception is `legacy-fare.ts`, which is deprecated.
- **Time comes from the injected `Clock`** (epoch ms). Never call `Date.now()` in `src/`.
  Randomness comes from `SeededRng`.
- **Stores hold frozen snapshots.** To change an entity, spread it into a new object and `put` it.
- **Every state change emits a domain event** on the `EventBus` after the store write.
  The `EventLog`, `SurgeService` and `PayoutService` are bus subscribers.
- **Errors**: throw `FleetError` subclasses (`ValidationError` 400, `ForbiddenError` 403,
  `NotFoundError` 404, `ConflictError`/`InvalidTransitionError` 409). The API maps them to
  `{ error: { code, message } }`.
- **API identity comes from the bearer token** (`principal`), never from the request body.

## Fare formula (see `pricing/fare.ts`)

```
metered = base + perKm·km + perMin·min          (each component rounded to cents)
surged  = metered · surge                        (surge locked at request time)
ride    = max(surged, minimumFare)               (minimum applies AFTER surge)
total   = ride + bookingFee − promoDiscount      (promo discounts the ride portion only)
```

Drivers earn `ride − commission(25%)`. Promos are platform-funded. The booking fee is platform revenue.

## Running

```ts
import { createFleet } from "./src/app";
const fleet = createFleet();                 // FakeClock + auto-accepting offer gateway by default
const res = await fleet.call("POST", "/riders", null, { name: "Ana", phone: "+14155550100" });
```

Run the tests from the Tests panel. All of `tests/` passes on main.

## Known issues / TODO

- PRICE-212: upfront prices still use `legacy-fare.ts`.
- PRICE-301: surge has no smoothing between recomputes.
- Service areas (`LAUNCH_AREAS`) are not enforced on trip requests yet.
- The no-driver → system-cancel policy lives in the API handler. It should move to a TripOrchestrator.
