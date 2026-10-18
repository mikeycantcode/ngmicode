/**
 * Error hierarchy for the ledger. Every error thrown on purpose by the domain
 * or service layer is a LedgerError with a stable machine-readable `code`;
 * the api layer maps codes to HTTP statuses (see api/http.ts).
 */
export class LedgerError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends LedgerError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("validation_error", message, details);
  }
}

export class NotFoundError extends LedgerError {
  constructor(entity: string, id: string) {
    super("not_found", `${entity} ${id} not found`, { entity, id });
  }
}

export class ConflictError extends LedgerError {
  constructor(message: string, code = "conflict", details?: Record<string, unknown>) {
    super(code, message, details);
  }
}

export class InvalidTransitionError extends LedgerError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("invalid_transition", message, details);
  }
}

export class UnbalancedEntryError extends LedgerError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("unbalanced_entry", message, details);
  }
}

export class InsufficientFundsError extends LedgerError {
  constructor(accountId: string, available: number, requested: number) {
    super("insufficient_funds", `account ${accountId} has insufficient funds`, { accountId, available, requested });
  }
}

export class NoRateError extends LedgerError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("no_rate", message, details);
  }
}

export class UnauthorizedError extends LedgerError {
  constructor(message = "missing or invalid API key") {
    super("unauthorized", message);
  }
}

export class ForbiddenError extends LedgerError {
  constructor(message: string) {
    super("forbidden", message);
  }
}
