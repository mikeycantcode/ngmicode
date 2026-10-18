import type { Role } from "../domain/customer";
import type { SessionStore } from "../accounts/account-service";
import type { CustomerRepository } from "../repo/stores";
import { AppError, AuthError, ForbiddenError, ValidationError } from "../shared/errors";
import type { Middleware } from "./types";

/** Maps thrown errors to JSON responses. Must be the first global middleware. */
export function errorMapper(onUnexpected: (e: unknown) => void = () => {}): Middleware {
  return async (_req, next) => {
    try {
      return await next();
    } catch (e) {
      if (e instanceof AppError) {
        const error: Record<string, unknown> = { code: e.code, message: e.message };
        if (e.details !== undefined) error.details = e.details;
        return { status: e.status, body: { error } };
      }
      onUnexpected(e);
      return { status: 500, body: { error: { code: "internal", message: "internal error" } } };
    }
  };
}

/**
 * Resolves `Authorization: Bearer <token>` into req.user. Missing header =
 * anonymous (req.user stays null). A present-but-invalid token is a 401.
 */
export function authenticate(sessions: SessionStore, customers: CustomerRepository): Middleware {
  return async (req, next) => {
    const header = req.headers["authorization"];
    if (header) {
      const m = /^Bearer\s+(\S+)$/.exec(header);
      const session = m ? sessions.resolve(m[1]) : null;
      const customer = session ? customers.get(session.customerId) : undefined;
      if (!customer) throw new AuthError("invalid or expired token");
      req.user = { id: customer.id, role: customer.role };
    }
    return next();
  };
}

export const requireAuth: Middleware = async (req, next) => {
  if (!req.user) throw new AuthError("authentication required");
  return next();
};

export function requireRole(role: Role): Middleware {
  return async (req, next) => {
    if (!req.user) throw new AuthError("authentication required");
    if (req.user.role !== role) throw new ForbiddenError(`${role} role required`);
    return next();
  };
}

export function validateBody(schema: Schema, opts?: ValidateOptions): Middleware {
  return async (req, next) => {
    assertValid(req.body, schema, opts);
    return next();
  };
}

// --- request validation ---

export type FieldType = "string" | "integer" | "boolean" | "array" | "object";

export interface FieldSpec {
  type: FieldType;
  required?: boolean;
  /** integer: minimum value; string/array: minimum length */
  min?: number;
  /** integer: maximum value; string/array: maximum length */
  max?: number;
  enum?: readonly string[];
}

export type Schema = Record<string, FieldSpec>;

export interface ValidateOptions {
  /** Reject keys not present in the schema. Default false. */
  strict?: boolean;
}

/** Returns a list of human-readable problems; empty means valid. */
export function validate(body: unknown, schema: Schema, opts: ValidateOptions = {}): string[] {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return ["body must be a JSON object"];
  const obj = body as Record<string, unknown>;
  const errors: string[] = [];
  for (const [key, spec] of Object.entries(schema)) {
    const value = obj[key];
    if (value === undefined || value === null) {
      if (spec.required) errors.push(`${key} is required`);
      continue;
    }
    const problem = checkField(value, spec);
    if (problem) errors.push(`${key} ${problem}`);
  }
  if (opts.strict) {
    for (const key of Object.keys(obj)) if (!(key in schema)) errors.push(`${key} is not allowed`);
  }
  return errors;
}

function checkField(value: unknown, spec: FieldSpec): string | null {
  switch (spec.type) {
    case "string":
      if (typeof value !== "string") return "must be a string";
      if (spec.min !== undefined && value.length < spec.min) return `must be at least ${spec.min} characters`;
      if (spec.max !== undefined && value.length > spec.max) return `must be at most ${spec.max} characters`;
      if (spec.enum && !spec.enum.includes(value)) return `must be one of ${spec.enum.join(", ")}`;
      return null;
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) return "must be an integer";
      if (spec.min !== undefined && value < spec.min) return `must be >= ${spec.min}`;
      if (spec.max !== undefined && value > spec.max) return `must be <= ${spec.max}`;
      return null;
    case "boolean":
      return typeof value === "boolean" ? null : "must be a boolean";
    case "array":
      if (!Array.isArray(value)) return "must be an array";
      if (spec.min !== undefined && value.length < spec.min) return `must have at least ${spec.min} items`;
      if (spec.max !== undefined && value.length > spec.max) return `must have at most ${spec.max} items`;
      return null;
    case "object":
      return typeof value === "object" && !Array.isArray(value) ? null : "must be an object";
  }
}

export function assertValid(body: unknown, schema: Schema, opts?: ValidateOptions): void {
  const errors = validate(body, schema, opts);
  if (errors.length) throw new ValidationError("invalid request body", errors);
}

/** Parses an optional integer query parameter; throws ValidationError on garbage. */
export function queryInt(query: Record<string, string>, name: string): number | undefined {
  const raw = query[name];
  if (raw === undefined || raw === "") return undefined;
  if (!/^-?\d+$/.test(raw)) throw new ValidationError(`${name} must be an integer`);
  return Number(raw);
}
