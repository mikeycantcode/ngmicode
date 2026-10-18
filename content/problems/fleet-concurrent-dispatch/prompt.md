# One driver, two riders

**Incident INC-2291.** During Friday's rush, drivers received **two trips at once**. Two riders
both saw "Your driver is on the way" with the same car and plate. One of them waited 20 minutes
for a car that never came. Logs show both trips in `matched` with the same `driverId`. The
driver's `currentTripId` pointed at only one of them.

Ops also reported a second, rarer oddity from the same night. A rider cancelled while we were
still "finding a driver". A few seconds later, the dispatch request blew up with an error, and
the driver stayed stuck in a weird state.

Each rider request runs its own `dispatch()` concurrently. Offers to drivers are asynchronous:
we push the offer to the driver app and await accept or decline.

## The ask

Make real-time dispatch correct under concurrency:

1. A driver must never be assigned to two trips. A driver with an **outstanding offer** must not
   receive another offer.
2. If the driver declines (or times out), they're immediately offerable again.
3. If the trip is cancelled while an offer is outstanding, `dispatch` resolves
   `{ status: "cancelled", tripId }`. It must not throw. The trip stays cancelled with no driver,
   and the driver ends up `available`.
4. If concurrency leaves a request with nobody to offer, it resolves
   `{ status: "no_drivers", tripId }` as today. It must not throw.
5. If a driver goes offline while their offer is pending and accepts anyway, don't assign them.
   Move on to the next candidate.

Keep the public shape of `DispatchResult` and the existing offer gateway interface.
Assume a single Node process: no distributed locks needed.
