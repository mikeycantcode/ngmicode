import { ValidationError } from "../shared/errors";

/** WGS84 coordinate in decimal degrees. */
export interface LatLng {
  lat: number;
  lng: number;
}

export function isValidLatLng(p: unknown): p is LatLng {
  if (typeof p !== "object" || p === null) return false;
  const { lat, lng } = p as Record<string, unknown>;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function assertLatLng(p: unknown, field = "location"): LatLng {
  if (!isValidLatLng(p)) {
    throw new ValidationError(`${field} must be {lat: -90..90, lng: -180..180}`, { field });
  }
  return { lat: p.lat, lng: p.lng };
}

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function latLngEquals(a: LatLng, b: LatLng, epsilon = 1e-9): boolean {
  return Math.abs(a.lat - b.lat) <= epsilon && Math.abs(a.lng - b.lng) <= epsilon;
}

export function formatLatLng(p: LatLng): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}

// ---- service areas -----------------------------------------------------------
/**
 * A rectangular service area. If minLng > maxLng the box crosses the
 * antimeridian (e.g. Fiji: minLng 176.5, maxLng -178.5).
 */
export interface ServiceArea {
  id: string;
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function areaContains(area: ServiceArea, p: LatLng): boolean {
  if (p.lat < area.minLat || p.lat > area.maxLat) return false;
  if (area.minLng <= area.maxLng) return p.lng >= area.minLng && p.lng <= area.maxLng;
  return p.lng >= area.minLng || p.lng <= area.maxLng;
}

export function findServiceArea(areas: readonly ServiceArea[], p: LatLng): ServiceArea | undefined {
  return areas.find((a) => areaContains(a, p));
}

// Launch markets. Not enforced yet — see TODO in TripService.requestTrip.
export const LAUNCH_AREAS: ServiceArea[] = [
  { id: "sfo", name: "San Francisco Bay", minLat: 37.2, maxLat: 38.0, minLng: -122.6, maxLng: -121.7 },
  { id: "nyc", name: "New York City", minLat: 40.48, maxLat: 40.93, minLng: -74.27, maxLng: -73.68 },
  { id: "suv", name: "Fiji (Viti Levu + Taveuni)", minLat: -18.4, maxLat: -16.0, minLng: 176.8, maxLng: -179.7 },
];
