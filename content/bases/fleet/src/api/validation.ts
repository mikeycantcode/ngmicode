import type { LatLng } from "../geo/latlng";
import { ValidationError } from "../shared/errors";

/**
 * Request-body parsing helpers. Bodies are untrusted JSON: never assume a
 * field's type, never coerce strings to numbers.
 */
export type Body = Record<string, unknown>;

export function asBody(raw: unknown): Body {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new ValidationError("body must be a JSON object");
  return raw as Body;
}

export function requireString(body: Body, field: string, maxLen = 200): string {
  const v = body[field];
  if (typeof v !== "string" || !v.trim()) throw new ValidationError(`${field} is required`, { field });
  if (v.length > maxLen) throw new ValidationError(`${field} must be <= ${maxLen} chars`, { field });
  return v;
}

export function optionalString(body: Body, field: string, maxLen = 200): string | null {
  const v = body[field];
  if (v === undefined || v === null) return null;
  return requireString(body, field, maxLen);
}

export function requireInt(body: Body, field: string, min: number, max: number): number {
  const v = body[field];
  if (typeof v !== "number" || !Number.isInteger(v)) throw new ValidationError(`${field} must be an integer`, { field });
  if (v < min || v > max) throw new ValidationError(`${field} must be in [${min}, ${max}]`, { field });
  return v;
}

/** Strict coordinate parsing: numbers only, finite, in range. */
export function parseLatLng(raw: unknown, field: string): LatLng {
  if (typeof raw !== "object" || raw === null) throw new ValidationError(`${field} must be an object`, { field });
  const { lat, lng } = raw as Record<string, unknown>;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new ValidationError(`${field}.lat must be a number in [-90, 90]`, { field });
  }
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new ValidationError(`${field}.lng must be a number in [-180, 180]`, { field });
  }
  return { lat, lng };
}
