import { ValidationError } from "../domain/errors";

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;

/** Parses an ISO-8601 date or date-time (with zone) into epoch ms. Date-only means 00:00Z. */
export function parseIso(input: unknown, field = "timestamp"): number {
  if (typeof input !== "string" || !ISO_RE.test(input)) {
    throw new ValidationError(`${field} must be an ISO-8601 timestamp`, { field });
  }
  const ms = Date.parse(input.length === 10 ? `${input}T00:00:00Z` : input);
  if (Number.isNaN(ms)) throw new ValidationError(`${field} must be an ISO-8601 timestamp`, { field });
  return ms;
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** UTC calendar day, e.g. "2024-03-01". */
export function toIsoDay(ms: number): string {
  return toIso(ms).slice(0, 10);
}

export function endOfUtcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS + DAY_MS - 1;
}

/**
 * @deprecated Off by one across DST in the old local-time implementation and
 * nobody remembers which callers depended on that. Use (b - a) / DAY_MS.
 */
export function daysBetween(a: number, b: number): number {
  return Math.round((b - a) / DAY_MS);
}
