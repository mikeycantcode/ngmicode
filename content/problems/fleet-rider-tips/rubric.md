## Intended approach
Map the flow before coding. API route (`api/handlers.ts`, `requireInt`, roles) → domain method on `TripService` (`addTip`: ownership, amount, status, duplicate, window) → snapshot update (`Trip.tipCents`, `tippedAt`, initialized in `requestTrip`) → event `trip.tipped` on the bus (add it to `FleetEventType`) → `PayoutService` subscribes and appends a `tip` ledger entry, commission 0, `at` = event time. The event log picks it up automatically through the `*` subscription.

## Key files
- `src/api/handlers.ts`, `src/api/validation.ts`
- `src/trips/trip.ts`, `src/trips/trip-service.ts`
- `src/shared/events.ts` (event type union)
- `src/payouts/payout-service.ts` (ledger kinds, subscriptions, statement and payout windows)
- `src/events/event-log.ts` (no change needed: wildcard subscriber)

## Traps
- **Payout period:** booking the tip at `completedAt`, or adding it onto the existing `trip_earnings` entry, puts it in an already-paid period. The hidden test runs a payout before the tip.
- **Commission:** reusing the trip-earnings path applies 25% commission.
- **Mutating the fare** (adding the tip into `fare.totalCents` or `rideCents`) changes payouts and the charged amount.
- **Snapshot convention:** stores hold frozen objects. Mutating `trip.tipCents` in place throws in strict mode or silently fails. The candidate must `put` a new snapshot.
- **Window boundary:** inclusive at exactly 72h (`>` vs `>=`).
- **Validation:** strings and non-integers must be rejected, not coerced. Reuse `requireInt`.
- **Authz:** the route must be rider-only and check ownership. Admin must get 403 (role list).
- Error codes must be the exact strings, through `ConflictError`, so the API maps them to 409.

## Strong signals
- Sketches the end-to-end change list (API, domain, model, event, ledger) and sequences the agent through it, verifying each layer.
- Notices the immutable-snapshot and event-after-write conventions in the README and follows them.
- Tests the payout-period edge, the 72h boundary and the duplicate case.
- Keeps business rules in `TripService`, not the handler.

## Weak signals
- Puts all logic in the handler and writes directly to stores.
- Never looks at payouts, or adds the tip to the fare.
- No tests beyond the happy path.

## Follow-up questions
- Two tip requests arrive concurrently from a flaky mobile network. Is "one tip per trip" still guaranteed? What about across processes? (An idempotency key, a conditional write.)
- How would you support editing a tip within an hour? What would the ledger look like? (A reversal entry, not a mutation.)
- Tip fraud: a rider tips, then charges back. How does the ledger represent the clawback, and who eats the loss?
- Where should a tip appear on the rider's receipt, and should it be a separate charge to the card?
