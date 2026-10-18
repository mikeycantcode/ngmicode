/**
 * Error hierarchy. `code` is the stable machine-readable identifier returned
 * by the API; `status` is the HTTP status the API layer responds with.
 */
export class FleetError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, status = 500, details?: Record<string, unknown>) {
    super(message);
    this.name = "FleetError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends FleetError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("validation_error", message, 400, details);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends FleetError {
  constructor(message = "missing or invalid credentials") {
    super("unauthorized", message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends FleetError {
  constructor(message = "not allowed") {
    super("forbidden", message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends FleetError {
  constructor(entity: string, id: string) {
    super("not_found", `${entity} ${id} not found`, 404, { entity, id });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends FleetError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 409, details);
    this.name = "ConflictError";
  }
}

export class InvalidTransitionError extends ConflictError {
  constructor(entity: string, from: string, to: string) {
    super("invalid_transition", `${entity} cannot go from ${from} to ${to}`, { from, to });
    this.name = "InvalidTransitionError";
  }
}

export function isFleetError(e: unknown): e is FleetError {
  return e instanceof FleetError;
}

/**
 * Result type for operations whose failure is an expected outcome
 * (validation, lookups). Services throw FleetError subclasses for
 * programmer/consistency errors; the API layer maps both to HTTP.
 */
export type Result<T, E = FleetError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw r.error;
}

export function mapResult<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}
