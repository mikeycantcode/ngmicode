## Intended approach
Decompose the policy into ordered rules and give each boundary explicitly: inclusive free window, strictly-after late threshold, null ETA, floor of full minutes, surge then cap. Point the agent at `applyBps` in `shared/money.ts` for the surge. The result is a ~20-line change in one function. A strong candidate reviews the diff line by line against each rule and asks for a few boundary checks (exactly 120 000 ms, exactly at the late threshold, cap with surge).

## Key files
- `src/trips/cancellation.ts`
- `src/shared/money.ts` (`applyBps`, `roundHalfUp`)
- `src/trips/trip.ts` (`matchedAt`, `arrivedAt`, `pickupEtaSec`, `surgeBps`)

## Traps
- **Cap before vs after surge:** capping at 1500 and then surging gives 2250. The spec says surge first, then cap.
- **Boundaries:** free window is `<=`, late threshold is strict `>`. Penalize a spec that leaves either comparison unspecified, even if the result happens to be correct.
- **pickupEtaSec null** must not waive the fee (`null * 1000 = 0` would make every trip "late" after 5 min).
- **Full minutes:** use floor of `(waited − 2 min) / 1 min`, clamped at 0. Not ceil, not round.
- **Rounding:** surge with odd bps (12 345) must round half-up via the money helpers, not truncate.
- Driver and system rules and the in_progress throw must be preserved when rewriting.

## Strong signals
- Writes the spec as an ordered decision list with the exact operators, constants and units (ms vs s for ETA).
- Mentions reuse of `applyBps` instead of float math.
- Verifies with the worked examples and at least one boundary per rule.

## Weak signals
- Pastes the policy verbatim and accepts the result without checking the operators.
- Lets the agent touch `trip-service.ts` or config without need.
- Misses the ETA seconds-to-ms conversion.

## Follow-up questions
- The driver-late waiver uses the ETA we quoted at match time. What if dispatch re-routes the driver? Which ETA is fair?
- Should the waiting surcharge go 100% to the driver? Where would you change that? (`PayoutService.onCancelled`.)
- Is applying surge to a cancellation fee defensible to riders? What would you log to audit disputes?
- How would you test the policy across many boundaries without hand-writing 50 cases? (Table-driven tests.)
