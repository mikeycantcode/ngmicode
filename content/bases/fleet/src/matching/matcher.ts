import type { MatchingConfig } from "../config";
import type { DriverCandidate } from "../drivers/driver";
import { estimatePickupEtaSec } from "./eta";

export interface RankedCandidate {
  driverId: string;
  distanceKm: number;
  etaSec: number;
}

/**
 * Orders candidates for a single pickup: lowest ETA first, then shortest
 * distance, then driver id (stable, deterministic).
 */
export function rankCandidates(candidates: readonly DriverCandidate[], cfg: MatchingConfig): RankedCandidate[] {
  return candidates
    .map((c) => ({
      driverId: c.driver.id,
      distanceKm: c.distanceKm,
      etaSec: estimatePickupEtaSec(c.distanceKm, cfg),
    }))
    .filter((c) => c.distanceKm <= cfg.searchRadiusKm)
    .sort((a, b) => a.etaSec - b.etaSec || a.distanceKm - b.distanceKm || (a.driverId < b.driverId ? -1 : 1));
}

export function bestCandidate(candidates: readonly DriverCandidate[], cfg: MatchingConfig): RankedCandidate | null {
  return rankCandidates(candidates, cfg)[0] ?? null;
}
