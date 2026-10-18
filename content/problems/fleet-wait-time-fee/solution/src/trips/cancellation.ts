import type { TripConfig } from "../config";
import { InvalidTransitionError } from "../shared/errors";
import type { Cents } from "../shared/money";
import type { CancelActorRole, Trip } from "./trip";
import { computeWaitingFeeCents } from "./waiting";

/**
 * Cancellation fee charged to the rider when `by` cancels `trip` at `now`.
 *
 * Policy (v2, 2023):
 *  - drivers and the system never cause a rider fee
 *  - free while we're still looking for a driver
 *  - free within `freeCancelWindowMs` of being matched
 *  - otherwise a flat `riderCancelFeeCents`
 *  - after the driver arrived: flat fee + the waiting fee accrued so far
 */
export function computeCancellationFee(trip: Trip, by: CancelActorRole, now: number, cfg: TripConfig): Cents {
  if (trip.status === "in_progress" || trip.status === "completed" || trip.status === "cancelled") {
    throw new InvalidTransitionError("trip", trip.status, "cancelled");
  }
  if (by !== "rider") return 0;
  switch (trip.status) {
    case "requested":
      return 0;
    case "matched":
      return now - (trip.matchedAt ?? now) <= cfg.freeCancelWindowMs ? 0 : cfg.riderCancelFeeCents;
    case "driver_arrived":
      return cfg.riderCancelFeeCents + computeWaitingFeeCents(trip.arrivedAt, now, cfg);
  }
}
