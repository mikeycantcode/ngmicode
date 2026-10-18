// Grab-bag of small helpers: Result type, logging, string/encoding utils.

// Lightweight Result type. Services mostly throw AppErrors; the Result type is
// used at the edges (validation, webhook verification) where failure is an
// expected outcome rather than an exceptional one.

export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E = string> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw new Error(`unwrap on Err: ${String(r.error)}`);
}

export function mapResult<T, U, E>(r: Result<T, E>, f: (v: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}

// ---- logging ----

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  log(level: LogLevel, msg: string, fields?: Record<string, unknown>): void;
}

export class MemoryLogger implements Logger {
  readonly lines: { level: LogLevel; msg: string; fields?: Record<string, unknown> }[] = [];
  log(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    this.lines.push({ level, msg, fields });
    if (this.lines.length > 1000) this.lines.shift();
  }
}

export const nullLogger: Logger = { log: () => {} };

// ---- encoding ----

// Opaque-token helpers. We avoid btoa/atob (not guaranteed in every runtime we
// ship to) and use a hex encoding of UTF-16 code units instead.

export function toHex(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) out += s.charCodeAt(i).toString(16).padStart(4, "0");
  return out;
}

export function fromHex(hex: string): string | null {
  if (hex.length % 4 !== 0 || !/^[0-9a-f]*$/.test(hex)) return null;
  let out = "";
  for (let i = 0; i < hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return out;
}

// ---- strings ----

// Misc string helpers.

/**
 * @deprecated Use renderPreview (domain/preview) for anything user-facing.
 * Kept because the legacy email digest still calls it.
 */
export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "..." : s;
}

export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
