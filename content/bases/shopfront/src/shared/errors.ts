// Error hierarchy. The HTTP layer maps AppError subclasses to status codes in
// http/middleware.ts (errorMapper); anything else becomes a 500.

export class AppError extends Error {
  readonly status: number = 500;
  readonly code: string = "internal";
  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  readonly status = 400;
  readonly code = "validation_failed";
}

export class AuthError extends AppError {
  readonly status = 401;
  readonly code = "unauthenticated";
}

export class ForbiddenError extends AppError {
  readonly status = 403;
  readonly code = "forbidden";
}

export class NotFoundError extends AppError {
  readonly status = 404;
  readonly code = "not_found";
}

export class ConflictError extends AppError {
  readonly status = 409;
  readonly code = "conflict";
}

export class OutOfStockError extends ConflictError {
  readonly code = "out_of_stock";
  constructor(readonly sku: string, readonly requested: number, readonly available: number) {
    super(`insufficient stock for ${sku}: requested ${requested}, available ${available}`, { sku, requested, available });
  }
}

export class PaymentDeclinedError extends AppError {
  readonly status = 402;
  readonly code = "payment_declined";
}

// --- Result type (for expected, non-exceptional failures) ---

export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E = string> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw r.error instanceof Error ? r.error : new Error(String(r.error));
}
