import type { BackoffOptions } from "../core/types";
import type { Rng } from "./rng";

/**
 * Delay in ms before try number `attempt + 1`, given that try number `attempt`
 * (1-based) just failed.
 *
 *   fixed:        delay
 *   exponential:  delay * 2^(attempt - 1)
 *
 * `maxDelay` caps the value before jitter. With jitter j, the result is
 * scaled by (1 - j * r) where r = rng() — jitter only ever shortens the wait.
 * The rng is consumed exactly once when jitter > 0 and never otherwise, so
 * seeded runs stay reproducible. Result is rounded to the nearest ms.
 */
export function computeBackoff(attempt: number, backoff: number | BackoffOptions | undefined, rng: Rng): number {
  if (!Number.isInteger(attempt) || attempt < 1) throw new RangeError("attempt must be a positive integer");
  if (backoff === undefined) return 0;
  const opts: BackoffOptions = typeof backoff === "number" ? { type: "fixed", delay: backoff } : backoff;
  if (opts.type !== "fixed" && opts.type !== "exponential") {
    throw new RangeError(`unknown backoff type: ${String((opts as { type: unknown }).type)}`);
  }
  if (!Number.isFinite(opts.delay) || opts.delay < 0) throw new RangeError("backoff delay must be a non-negative number");
  const jitter = opts.jitter ?? 0;
  if (!(jitter >= 0 && jitter <= 1)) throw new RangeError("jitter must be between 0 and 1");

  let value = opts.type === "fixed" ? opts.delay : opts.delay * Math.pow(2, attempt - 1);
  if (opts.maxDelay !== undefined) value = Math.min(value, opts.maxDelay);
  if (jitter > 0) value = value * (1 - jitter * rng());
  return Math.round(value);
}
