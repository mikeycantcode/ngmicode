import type { MatchingConfig } from "../config";
import { haversineKm } from "../geo/haversine";
import type { LatLng } from "../geo/latlng";

/**
 * Pickup ETA in whole seconds (rounded up) for a driver `distanceKm`
 * straight-line away. This is THE ETA model: dispatch, quotes and the
 * rider app all must agree with it.
 */
export function estimatePickupEtaSec(distanceKm: number, cfg: MatchingConfig): number {
  const roadKm = distanceKm * cfg.roadFactor;
  return Math.ceil(cfg.pickupOverheadSec + (roadKm / cfg.avgSpeedKmh) * 3600);
}

export interface TripEstimate {
  distanceMeters: number;
  durationSec: number;
}

/** Estimated road distance and drive time for pickup -> dropoff. */
export function estimateTrip(pickup: LatLng, dropoff: LatLng, cfg: MatchingConfig): TripEstimate {
  const roadKm = haversineKm(pickup, dropoff) * cfg.roadFactor;
  return {
    distanceMeters: Math.round(roadKm * 1000),
    durationSec: Math.round((roadKm / cfg.avgSpeedKmh) * 3600),
  };
}
