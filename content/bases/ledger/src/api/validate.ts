import { isSupportedCurrency } from "../domain/currency";
import { ValidationError } from "../domain/errors";
import { parseIso } from "../lib/time";

// Input validation for API handlers. Every helper throws ValidationError with
// details.field set so clients can highlight the offending input.

export type Body = Record<string, unknown>;

export function asObject(body: unknown): Body {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("request body must be a JSON object");
  }
  return body as Body;
}

export function requireString(body: Body, field: string, maxLength = 200): string {
  const v = body[field];
  if (typeof v !== "string" || v.trim() === "") throw new ValidationError(`${field} is required`, { field });
  if (v.length > maxLength) throw new ValidationError(`${field} must be at most ${maxLength} characters`, { field });
  return v;
}

export function optionalString(body: Body, field: string, maxLength = 200): string | undefined {
  if (body[field] === undefined || body[field] === null) return undefined;
  return requireString(body, field, maxLength);
}

export function requirePositiveInt(body: Body, field: string): number {
  const v = body[field];
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0) {
    throw new ValidationError(`${field} must be a positive integer (minor units)`, { field });
  }
  return v;
}

export function optionalPositiveInt(body: Body, field: string): number | undefined {
  if (body[field] === undefined || body[field] === null) return undefined;
  return requirePositiveInt(body, field);
}

export function requireEnum<T extends string>(body: Body, field: string, values: readonly T[]): T {
  const v = body[field];
  if (typeof v !== "string" || !values.includes(v as T)) {
    throw new ValidationError(`${field} must be one of ${values.join(", ")}`, { field });
  }
  return v as T;
}

export function requireCurrency(body: Body, field = "currency"): string {
  const v = body[field];
  if (!isSupportedCurrency(v)) throw new ValidationError(`${field} must be a supported currency code`, { field });
  return v;
}

export function optionalBoolean(body: Body, field: string): boolean | undefined {
  const v = body[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") throw new ValidationError(`${field} must be a boolean`, { field });
  return v;
}

export function optionalIso(source: Body, field: string): number | undefined {
  const v = source[field];
  if (v === undefined || v === null || v === "") return undefined;
  return parseIso(v, field);
}

export function requireIso(source: Body, field: string): number {
  const v = optionalIso(source, field);
  if (v === undefined) throw new ValidationError(`${field} is required`, { field });
  return v;
}

/** Integer query param within [min, max]; returns `fallback` when absent. */
export function queryInt(query: Record<string, string>, field: string, min: number, max: number, fallback: number): number {
  const raw = query[field];
  if (raw === undefined || raw === "") return fallback;
  if (!/^-?\d+$/.test(raw)) throw new ValidationError(`${field} must be an integer`, { field });
  const n = Number(raw);
  if (n < min || n > max) throw new ValidationError(`${field} must be between ${min} and ${max}`, { field });
  return n;
}
