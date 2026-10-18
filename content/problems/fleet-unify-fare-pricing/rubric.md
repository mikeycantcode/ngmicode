## Intended approach
Find the deprecated module (`pricing/legacy-fare.ts`, `calculateFareLegacy`), then find ALL of its callers with a search. There are two: `QuoteService.quote` (the `estimatedFareCents` on the quote) and `TripService.requestTrip` (`quotedFareCents` stored on the trip). Its "matches computeFare for all normal trips" comment is false. Replace both callers with `computeFare({ distanceMeters, durationSec, surgeBps, promo }, config.pricing, config.currency).totalCents`, using the estimate from `estimateTrip`. Ideally extract one shared helper so the two upfront-price paths can't drift again. Delete `legacy-fare.ts`, and `dollarsToCents` if nothing else uses it.

## Key files
- `src/pricing/legacy-fare.ts` (deprecated; float dollars)
- `src/pricing/quote-service.ts` (caller 1)
- `src/trips/trip-service.ts` (caller 2: `quotedFareCents`)
- `src/pricing/fare.ts` (canonical)
- `src/shared/money.ts` (`dollarsToCents`, deprecated)

## Traps
- **Second caller:** fixing only the quote service leaves `trip.quotedFareCents` wrong. The hidden tests check both.
- **Divergences:** the legacy formula applies the minimum fare BEFORE surge (short surged trips over-quote: $13.75 vs $9.75). It discounts percentage promos on the total including the booking fee, and it rounds in float dollars. A candidate who "fixes" legacy-fare by patching one difference misses the others. The right move is to delete it.
- **"Final fares must not change":** an agent may "align" by changing `computeFare` to match legacy. The visible tests catch that.
- **Misleading comment:** "It does." in the legacy docstring.

## Strong signals
- Searches for usages before editing and finds both callers.
- Writes a characterization test (quote == charge for a trip that goes as estimated) before the refactor.
- Explains the concrete divergences to the interviewer (minimum vs surge order, promo base, float rounding).
- Removes dead code, the deprecated money helper included, when unused.

## Weak signals
- Edits `legacy-fare.ts` to mirror `computeFare` and keeps two implementations.
- Touches `computeFare`.
- Doesn't verify with a surge or promo case.

## Follow-up questions
- What other "two implementations of one rule" risks do you see in this repo? (ETA in quotes vs dispatch; cancellation rules.)
- The upfront price is a promise. If the trip runs longer, should we charge the quote or the meter? How would you model an upfront-price guarantee?
- How would you have rolled this out safely given finance's concern? (Shadow-compute both, log the diffs, then switch.)
- Why is float-dollar math dangerous here? Give a concrete rounding example.
