# Waiting-time fee

Drivers lose money when riders aren't at the pickup. Driver Ops wants a waiting-time fee,
like every competitor has. You own the backend change. Assume the apps already display
whatever the backend returns.

## Product spec

- Once the driver has **arrived** at the pickup, the rider gets **2 free minutes**.
- After that, the rider pays **40¢ for every full minute** of waiting. Waiting ends when the
  driver starts the trip. A partial minute is free: 4m59s of waiting is 2 billable minutes.
- On a completed trip, the waiting fee is its own component of the fare breakdown,
  `waitingCents`, and is included in `totalCents`.
- The waiting fee is **not surged**. It **doesn't count toward the minimum fare**, and promos
  **don't discount** it.
- Drivers keep **100%** of the waiting fee. The platform's commission applies only to the
  ride fare, as today.
- If the rider **cancels after the driver has arrived**, the cancellation fee includes the
  waiting fee accrued up to the moment of cancellation. That's on top of the existing flat fee.
  Leave the revenue share on cancellation fees as it is for now.
- Make the free window and the per-minute rate configurable, next to the other trip settings.

## Acceptance

- Example: 5m30s of waiting, 1.5x surge, 5 km / 15 min. The ride portion is $19.50, the waiting
  fee is $1.20 (not $1.80), and the total is $19.50 + $1.75 booking + $1.20.
- Existing fares, payouts and cancellations are unchanged when nobody waits beyond 2 minutes.
- Tests for the new behavior.
