# Cancellation policy v3

Rider Ops has finalized a new cancellation-fee policy. Riders complained about being charged
when the *driver* was the one running late. Drivers complained that riders keep them waiting
at the pickup and then cancel for the same flat $5.

**Your instructions to the agent are graded for precision.** You are
scored on how precisely you delegate this, not on typing the code yourself.

## Scope

Change only `computeCancellationFee` in `src/trips/cancellation.ts`. Keep its signature and
its existing guard that throws `InvalidTransitionError` for `in_progress`, `completed` and
`cancelled` trips. Use the existing `TripConfig` values (`freeCancelWindowMs` = 2 min,
`riderCancelFeeCents` = 500). Hard-code the new constants below in that module.

## Policy v3

All amounts are integer cents. All times are epoch ms from the `now` argument.

1. A cancellation by the **driver** or the **system** never costs the rider anything: 0.
2. The rider cancels while the trip is **`requested`**: 0.
3. The rider cancels while **`matched`**:
   - If `now − matchedAt` is **at most** `freeCancelWindowMs`: 0.
   - Otherwise, if the driver is late: 0. The driver is late when `now` is **strictly after**
     `matchedAt + pickupEtaSec × 1000 + 5 minutes`. If `pickupEtaSec` is `null`, the driver is
     never considered late.
   - Otherwise the fee is `riderCancelFeeCents`.
4. The rider cancels while **`driver_arrived`**: the fee is `riderCancelFeeCents` plus **50 cents
   for each full minute** waited beyond the first 2 minutes after `arrivedAt`. A partial minute
   doesn't count.
5. Every non-zero fee from rules 3 and 4 is then multiplied by the trip's locked `surgeBps`
   (basis points, rounded half-up to the cent, using the money helpers), and **then** capped at
   **1 500 cents**.

## Examples

- Matched 2:00 ago → 0. Matched 2:00.001 ago, no surge → 500. Same at 1.5x → 750.
- Arrived, waited 4:59, surge 1.25x → (500 + 2 × 50) × 1.25 = 750.
- Arrived, waited 15:00, surge 1.5x → (500 + 13 × 50) × 1.5 = 1725 → capped to 1500.
