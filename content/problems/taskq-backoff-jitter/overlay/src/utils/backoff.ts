import type { BackoffOptions } from "../core/types";
import type { Rng } from "./rng";

/**
 * Delay in ms to wait after try number `attempt` (1-based) failed, before the
 * next try. Called by the worker lifecycle with `ctx.rng` (seeded).
 *
 * TODO(platform#402): the old implementation was removed together with the
 * v1 retry module. Re-implement per the retry spec.
 */
export function computeBackoff(attempt: number, backoff: number | BackoffOptions | undefined, rng: Rng): number {
  throw new Error("computeBackoff: not implemented");
}
