import type { MatchingConfig } from "../config";
import type { DriverCandidate } from "../drivers/driver";
import { EARTH_RADIUS_KM } from "../geo/haversine";
import { type LatLng, toRadians } from "../geo/latlng";
import { estimatePickupEtaSec } from "./eta";

export interface RankedCandidate {
  driverId: string;
  distanceKm: number;
  etaSec: number;
}

/**
 * FLEET-140 / PERF-88: rank on the driver's latest location fix rather than
 * the indexed position, and use the cheap flat-earth projection to do it —
 * inside the search radius it is accurate to <0.1% and ~3x faster than
 * haversine, which was the top frame in the dispatch flame graph.
 */
function fastDistanceKm(a: LatLng, b: LatLng): number {
  const x = toRadians(b.lng - a.lng) * Math.cos(toRadians((a.lat + b.lat) / 2));
  const y = toRadians(b.lat - a.lat);
  return Math.sqrt(x * x + y * y) * EARTH_RADIUS_KM;
}

/**
 * Orders candidates for a single pickup: lowest ETA first, then shortest
 * distance, then driver id (stable, deterministic). When `pickup` is given,
 * distances are re-measured from each driver's current location.
 */
export function rankCandidates(candidates: readonly DriverCandidate[], cfg: MatchingConfig, pickup?: LatLng): RankedCandidate[] {
  return candidates
    .map((c) => {
      const distanceKm = pickup && c.driver.location ? fastDistanceKm(pickup, c.driver.location) : c.distanceKm;
      return {
        driverId: c.driver.id,
        distanceKm,
        etaSec: estimatePickupEtaSec(distanceKm, cfg),
      };
    })
    .filter((c) => c.distanceKm <= cfg.searchRadiusKm)
    .sort((a, b) => a.etaSec - b.etaSec || a.distanceKm - b.distanceKm || (a.driverId < b.driverId ? -1 : 1));
}

export function bestCandidate(candidates: readonly DriverCandidate[], cfg: MatchingConfig): RankedCandidate | null {
  return rankCandidates(candidates, cfg)[0] ?? null;
}
