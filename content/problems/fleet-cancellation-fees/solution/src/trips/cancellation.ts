import type { TripConfig } from "../config";
import { InvalidTransitionError } from "../shared/errors";
import { applyBps, type Cents } from "../shared/money";
import type { CancelActorRole, Trip } from "./trip";

const LATE_GRACE_MS = 5 * 60_000;
const FREE_WAIT_MS = 2 * 60_000;
const WAIT_CENTS_PER_MINUTE = 50;
const FEE_CAP_CENTS = 1_500;

/**
 * Cancellation fee charged to the rider when `by` cancels `trip` at `now`.
 *
 * Policy v3 (2024):
 *  - drivers and the system never cause a rider fee
 *  - free while we're still looking for a driver
 *  - matched: free within `freeCancelWindowMs` (inclusive) or if the driver is
 *    more than 5 minutes later than the ETA we quoted; else the flat fee
 *  - driver_arrived: flat fee + 50c per full minute waited beyond 2 minutes
 *  - charged fees are multiplied by the trip's surge, then capped at $15
 */
export function computeCancellationFee(trip: Trip, by: CancelActorRole, now: number, cfg: TripConfig): Cents {
  if (trip.status === "in_progress" || trip.status === "completed" || trip.status === "cancelled") {
    throw new InvalidTransitionError("trip", trip.status, "cancelled");
  }
  if (by !== "rider") return 0;

  let fee: Cents;
  switch (trip.status) {
    case "requested":
      return 0;
    case "matched": {
      const matchedAt = trip.matchedAt ?? now;
      if (now - matchedAt <= cfg.freeCancelWindowMs) return 0;
      if (trip.pickupEtaSec !== null && now > matchedAt + trip.pickupEtaSec * 1000 + LATE_GRACE_MS) return 0;
      fee = cfg.riderCancelFeeCents;
      break;
    }
    case "driver_arrived": {
      const waited = now - (trip.arrivedAt ?? now);
      const extraMinutes = Math.floor(Math.max(0, waited - FREE_WAIT_MS) / 60_000);
      fee = cfg.riderCancelFeeCents + WAIT_CENTS_PER_MINUTE * extraMinutes;
      break;
    }
  }
  return Math.min(FEE_CAP_CENTS, applyBps(fee!, trip.surgeBps));
}
