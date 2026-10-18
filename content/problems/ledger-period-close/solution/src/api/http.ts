import { LedgerError } from "../domain/errors";
import type { Logger } from "../lib/log";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface ApiRequest {
  method: HttpMethod;
  /** Path, optionally with a query string: "/accounts/acct_000001/statement?from=..." */
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export function json(status: number, body: unknown, headers?: Record<string, string>): ApiResponse {
  return headers ? { status, body, headers } : { status, body };
}

/** Case-insensitive header lookup. */
export function header(req: ApiRequest, name: string): string | undefined {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(req.headers ?? {})) if (k.toLowerCase() === want) return v;
  return undefined;
}

const STATUS_BY_CODE: Record<string, number> = {
  validation_error: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  period_closed: 409,
  invalid_transition: 409,
  idempotency_mismatch: 422,
  idempotency_in_progress: 409,
  unbalanced_entry: 422,
  insufficient_funds: 422,
  no_rate: 422,
};

export function errorResponse(e: unknown, log?: Logger): ApiResponse {
  if (e instanceof LedgerError) {
    const status = STATUS_BY_CODE[e.code] ?? 400;
    return json(status, { error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } });
  }
  // Never leak internals to API clients.
  log?.error("unhandled error", { message: e instanceof Error ? e.message : String(e) });
  return json(500, { error: { code: "internal_error", message: "internal error" } });
}
