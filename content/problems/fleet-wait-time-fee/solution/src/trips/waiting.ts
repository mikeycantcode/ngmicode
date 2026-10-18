import type { TripConfig } from "../config";
import type { Cents } from "../shared/money";

/**
 * Waiting fee for a rider who kept the driver waiting at pickup from
 * `arrivedAt` until `until`: per FULL minute beyond the free window.
 * Never surged, never discounted, 100% to the driver.
 */
export function computeWaitingFeeCents(arrivedAt: number | null, until: number, cfg: TripConfig): Cents {
  if (arrivedAt === null) return 0;
  const billable = Math.max(0, until - arrivedAt - cfg.freeWaitMs);
  return Math.floor(billable / 60_000) * cfg.waitingFeePerMinuteCents;
}
