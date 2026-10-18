import { err, ok, type Result } from "../util/common";

// Tiny schema validator for command params. Each validator returns a Result
// with a human-readable message naming the offending field. Unknown params
// are ignored (TODO: strict mode once the mobile client stops sending `ts`).

export type Validator<T> = (value: unknown, path: string) => Result<T, string>;
export type Schema = Record<string, Validator<unknown>>;
export type Infer<S extends Schema> = { [K in keyof S]: S[K] extends Validator<infer T> ? T : never };

export const v = {
  string(opts: { min?: number; max?: number; pattern?: RegExp } = {}): Validator<string> {
    return (value, path) => {
      if (typeof value !== "string") return err(`${path} must be a string`);
      if (opts.min !== undefined && value.length < opts.min) return err(`${path} must be at least ${opts.min} characters`);
      if (opts.max !== undefined && value.length > opts.max) return err(`${path} must be at most ${opts.max} characters`);
      if (opts.pattern && !opts.pattern.test(value)) return err(`${path} is malformed`);
      return ok(value);
    };
  },

  /** An entity id with the given prefix, e.g. v.id("c") accepts "c_000001". */
  id(prefix: string): Validator<string> {
    const re = new RegExp(`^${prefix}_[0-9]{6,}$`);
    return (value, path) => (typeof value === "string" && re.test(value) ? ok(value) : err(`${path} must be a ${prefix}_ id`));
  },

  int(opts: { min?: number; max?: number } = {}): Validator<number> {
    return (value, path) => {
      if (typeof value !== "number" || !Number.isInteger(value)) return err(`${path} must be an integer`);
      if (opts.min !== undefined && value < opts.min) return err(`${path} must be >= ${opts.min}`);
      if (opts.max !== undefined && value > opts.max) return err(`${path} must be <= ${opts.max}`);
      return ok(value);
    };
  },

  bool(): Validator<boolean> {
    return (value, path) => (typeof value === "boolean" ? ok(value) : err(`${path} must be a boolean`));
  },

  oneOf<T extends string>(values: readonly T[]): Validator<T> {
    return (value, path) =>
      typeof value === "string" && (values as readonly string[]).includes(value)
        ? ok(value as T)
        : err(`${path} must be one of ${values.join(", ")}`);
  },

  array<T>(item: Validator<T>, opts: { max?: number } = {}): Validator<T[]> {
    return (value, path) => {
      if (!Array.isArray(value)) return err(`${path} must be an array`);
      if (opts.max !== undefined && value.length > opts.max) return err(`${path} must have at most ${opts.max} items`);
      const out: T[] = [];
      for (let i = 0; i < value.length; i++) {
        const r = item(value[i], `${path}[${i}]`);
        if (!r.ok) return r;
        out.push(r.value);
      }
      return ok(out);
    };
  },

  optional<T>(inner: Validator<T>): Validator<T | undefined> {
    return (value, path) => (value === undefined || value === null ? ok(undefined) : inner(value, path));
  },
};

export function validate<S extends Schema>(schema: S, params: unknown): Result<Infer<S>, string> {
  if (params !== undefined && (typeof params !== "object" || params === null || Array.isArray(params))) {
    return err("params must be an object");
  }
  const input = (params ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, validator] of Object.entries(schema)) {
    const r = validator(input[key], key);
    if (!r.ok) return r;
    if (r.value !== undefined) out[key] = r.value;
  }
  return ok(out as Infer<S>);
}
