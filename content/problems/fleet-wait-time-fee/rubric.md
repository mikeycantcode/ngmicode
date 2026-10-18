## Intended approach
Orient fast: the README's fare formula, `pricing/fare.ts`, `TripService.completeTrip`, `trips/cancellation.ts`, `PayoutService.onCompleted`, `config.ts`. Add config (`freeWaitMs`, `waitingFeePerMinuteCents`) and one helper that computes the waiting fee from `arrivedAt` to an end time. Then thread it into: (1) `computeFare` as a separate component added after minimum fare and discount; (2) `completeTrip` (`arrivedAt` → `startedAt`); (3) the cancellation fee for `driver_arrived` (`arrivedAt` → `now`); (4) payouts, with commission on `rideCents` only. One helper, used in two places.

## Key files
- `src/pricing/fare.ts` (FareBreakdown + order of operations)
- `src/trips/trip-service.ts` (`completeTrip` has `arrivedAt`/`startedAt`)
- `src/trips/cancellation.ts` (second code path)
- `src/payouts/payout-service.ts` (commission currently on `rideCents`; must add the waiting fee to gross without commission)
- `src/config.ts`

## Traps
- **Order of operations:** adding waiting into `metered` makes it surged and counted toward the minimum. Adding it before the discount makes promos discount it. The hidden tests check all three.
- **Payouts:** if waiting is only added to `totalCents`, drivers never receive it, since payouts are based on `rideCents`. If it's added to `rideCents`, it gets the 25% commission (and surge or minimum interplay).
- **Second code path:** cancellation after arrival must include the accrued waiting fee.
- **Full minutes:** use floor, not ceil or round. 4m59s → 2 minutes.
- **Money convention:** integer cents and a config value, not float dollars.
- Visible tests use `toMatchObject` on fares, so adding `waitingCents: 0` doesn't break them. Rewriting existing expectations does.

## Strong signals
- Reads the fare docstring and README formula first, and decides where the fee sits in the pipeline before prompting.
- Gives the agent a complete change list (fare, trip service, cancellation, payouts, config), then verifies each one.
- Writes a test per rule (surge, minimum, promo, payout, cancellation).

## Weak signals
- "Add a waiting fee to the fare" and accepting a one-file diff in `fare.ts`.
- Never checking payouts.
- Hard-coding 40 and 120 000 inline in several places.

## Follow-up questions
- Waiting is computed from server timestamps of the `arrive` and `start` calls. How can a driver game that? What signals would you use (GPS at the pickup, rider notification time)?
- Should a waiting fee apply when the driver arrived at the wrong pickup point? How would you model disputes or refunds?
- On cancellation, the driver gets 80% of the whole fee, including waiting. How would you split it so the driver gets 100% of the waiting part? What data must the trip store?
- How would you show this on a receipt so riders understand it?
