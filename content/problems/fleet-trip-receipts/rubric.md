## Intended approach
Find where fares live: `Trip.fare` is a `FareBreakdown` from `pricing/fare.ts`. Every component already exists in integer cents. Then look at how routes, auth and errors are done in `api/handlers.ts` and `api/http.ts`. Build a small pure `buildReceipt(trip)` (domain layer) that maps the breakdown to ordered line items, drops zeros, negates the discount, and asserts the sum. Register the route with roles `["rider", "admin"]` and an ownership check. Throw `ConflictError("receipt_unavailable")` so the existing error mapper produces 409.

## Key files
- `src/pricing/fare.ts` (`FareBreakdown` fields and their invariants)
- `src/trips/trip.ts` (`fare`, `cancellationFeeCents`, `completedAt`, `cancelledAt`, `promoCode`)
- `src/api/handlers.ts`, `src/api/http.ts` (route options, principal, error mapping)
- `src/shared/errors.ts`, `src/shared/money.ts` (`formatMultiplier`, `sumCents`)

## Traps
- **Reusing `canView`:** the existing helper lets the trip's driver see the trip. The spec says drivers get 403 for receipts.
- **Recomputing the fare** instead of reading `trip.fare`: it risks drift (promo redeemed, config changed). The receipt must reflect what was charged.
- **Promo sign:** a positive promo line breaks the sum invariant.
- **Free cancellations** must be 409, not an empty receipt with total 0.
- Placing business logic inline in the handler works, but a pure function is easier to test. That's a design signal, not a requirement.
- Codes and order are specified. Tests compare `[code, amount]` pairs exactly.

## Strong signals
- Reads `FareBreakdown` before designing. Notes the documented invariant (`ride = base + distance + time + surge + minimum`).
- Puts the assembly in a pure function with a balance assertion, plus a thin handler.
- Tests the 403, 404 and 409 paths, not just the happy path.

## Weak signals
- Lets the agent invent field names or codes, or return dollars or float strings.
- Copies fare math into the handler.
- Ships without an authorization check, or gives drivers access.

## Follow-up questions
- Receipts are legal documents in some markets. What happens when a fare is later adjusted (refund, dispute)? How would you version receipts?
- Should the receipt be stored at completion time or rendered on read? What are the trade-offs?
- How would you localize labels and currency formatting without breaking finance's reconciliation?
- Pagination and filtering for a "my receipts" list: what would that API look like?
