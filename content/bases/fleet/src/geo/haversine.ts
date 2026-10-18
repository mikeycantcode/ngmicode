import { type LatLng, toDegrees, toRadians } from "./latlng";

export const EARTH_RADIUS_KM = 6371.0088;
export const KM_PER_DEG_LAT = 111.32;

/** Great-circle distance in km. Correct across the antimeridian and at the poles. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * s2 * s2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * 1000;
}

/**
 * Fast flat-earth approximation, good to ~0.5% under 50km. Handles the
 * antimeridian by taking the shortest longitudinal delta.
 */
export function equirectangularKm(a: LatLng, b: LatLng): number {
  let dLng = Math.abs(b.lng - a.lng);
  if (dLng > 180) dLng = 360 - dLng;
  const x = toRadians(dLng) * Math.cos(toRadians((a.lat + b.lat) / 2));
  const y = toRadians(b.lat - a.lat);
  return Math.sqrt(x * x + y * y) * EARTH_RADIUS_KM;
}

/** Initial bearing from a to b, degrees clockwise from north in [0, 360). */
export function initialBearingDeg(a: LatLng, b: LatLng): number {
  const φ1 = toRadians(a.lat);
  const φ2 = toRadians(b.lat);
  const Δλ = toRadians(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/** Point reached by travelling `km` from `origin` along `bearingDeg`. */
export function destinationPoint(origin: LatLng, bearingDeg: number, km: number): LatLng {
  const δ = km / EARTH_RADIUS_KM;
  const θ = toRadians(bearingDeg);
  const φ1 = toRadians(origin.lat);
  const λ1 = toRadians(origin.lng);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  // wrap to [-180, 180]
  let lng = ((toDegrees(λ2) + 540) % 360) - 180;
  if (lng === -180 && toDegrees(λ2) > 0) lng = 180;
  return { lat: toDegrees(φ2), lng };
}
