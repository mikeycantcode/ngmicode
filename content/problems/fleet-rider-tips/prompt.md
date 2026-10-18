# Rider tipping

We're launching in-app tipping next sprint. The rider app's design is final. The backend
doesn't exist yet, and it's yours.

## Product requirements

- After a trip is **completed**, the rider of that trip can add a tip:
  `POST /trips/:id/tip` with body `{ "amountCents": 500 }`. On success it responds **201** with
  the updated trip.
- Tips are between **$1.00 and $200.00** (inclusive), in whole cents. Anything else is
  **400** `validation_error`.
- **One tip per trip.** A second attempt gets **409** `already_tipped`.
- Tipping closes **72 hours** after the trip completed. Exactly 72h is still allowed.
  Later attempts get **409** `tip_window_closed`. A trip that isn't completed gets **409**
  `trip_not_completed`.
- Only the trip's rider can tip. Other riders, drivers and admins get **403**.
- The trip exposes `tipCents` (0 if none) and `tippedAt` (null if none). The fare breakdown and
  the amount charged for the ride don't change.
- **Drivers get 100% of tips.** No commission. A tip shows up in the driver's earnings
  statement and payouts as its own entry, booked **at the time the tip was given**. Example: a
  trip completes on Sunday night, the weekly payout runs, and the rider tips on Monday. That tip
  belongs to next week's payout.
- Tipping is an auditable event and must appear in the admin event log.
