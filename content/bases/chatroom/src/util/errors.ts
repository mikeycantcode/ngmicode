// Error hierarchy shared by every layer. The API router maps `code` onto the
// wire format ({ ok: false, error: code, message }), so codes are part of the
// public contract — don't rename them casually.

export class AppError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super("invalid_arguments", message);
    this.name = "ValidationError";
    this.field = field;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super("not_found", message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "not allowed") {
    super("forbidden", message);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("conflict", message);
    this.name = "ConflictError";
  }
}

export class RateLimitedError extends AppError {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super("rate_limited", `rate limited, retry after ${retryAfterMs}ms`);
    this.name = "RateLimitedError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class AuthError extends AppError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "AuthError";
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
