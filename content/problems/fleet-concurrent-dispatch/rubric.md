## Intended approach
Identify the race: `dispatch` reads candidates, then `await offers.offer(...)`, then calls `assignDriver`. Two dispatches interleave at the await and both pick the same "available" driver. `assignDriver` explicitly doesn't re-check the driver ("dispatcher guarantees availability"). Fix: a synchronous reservation (check-and-set) taken before the first await, and excluded from `findAvailableNear`/`isDispatchable`. Release it in a `finally` after the offer resolves. After the await, re-read the trip (cancelled → return `cancelled`) and the driver (not available → continue). Defense in depth: `assignDriver` rejects drivers that aren't `available`.

## Key files
- `src/matching/dispatcher.ts` (the await window)
- `src/drivers/driver-registry.ts` (`isDispatchable`, `findAvailableNear`; where a reservation naturally lives)
- `src/trips/trip-service.ts` (`assignDriver` doesn't check driver status; `cancelTrip`)
- `src/matching/batch-dispatcher.ts` (also calls `assignDriver`; must still work)

## Traps
- **Reserve after the await**, or check-then-act across the await: still racy. The reservation must happen synchronously before `offer()`.
- **Leaking reservations:** not releasing on decline, timeout, or a gateway exception (no `finally`) makes drivers disappear forever. The hidden test checks the driver is offerable after a decline.
- **Using driver status `on_trip` as the reservation:** this breaks `goOnline`/`goOffline` semantics, and leaves the driver on_trip with no trip on decline or cancel unless every path resets it.
- **Cancellation during an offer:** the base throws `InvalidTransitionError` from `assignDriver`. The candidate must re-check after the await and must not leave the driver reserved or on_trip.
- A weak model loses track of the multiple paths (decline, timeout, cancel, offline). The candidate should enumerate them explicitly and feed the model the dispatcher plus the registry together.
- Only fixing `assignDriver` (throwing on a busy driver) turns double-assignment into a crashing dispatch: test 2 expects `no_drivers`, not a rejection.

## Strong signals
- Explains the interleaving precisely (where the await yields), ideally with a timeline.
- Writes a deterministic concurrency test with a hand-controlled gateway (pending promises), not sleeps.
- Lists every exit path from the offer and checks the reservation is released on each.

## Weak signals
- Adds `setTimeout` delays or retries to "reduce" the race.
- Introduces a global mutex that serializes all dispatches (correct but kills throughput). Probe whether they see the cost.
- Can't explain why JS being single-threaded doesn't prevent this.

## Follow-up questions
- How does this change with multiple dispatcher processes? (A conditional write or CAS in Redis/Postgres, a lease with TTL.)
- What happens if the gateway never resolves? How would you add an offer timeout without leaking reservations?
- The same trip could be dispatched twice (a double-tapped Request button). Is that safe now? How would you make dispatch idempotent per trip?
- Should a reserved driver count as supply for surge pricing?
