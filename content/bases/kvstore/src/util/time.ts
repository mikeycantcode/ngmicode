// Legacy time helpers from before the Clock abstraction existed (v0.3).
//
// @deprecated Use the injected Clock (`store.clock` / `ctx.clock`) instead.
// A few call sites still use nowMs(); they should be migrated when touched.

export function nowMs(): number {
  return Date.now();
}

export function secondsToMs(seconds: number): number {
  return seconds * 1000;
}

/** Redis rounds TTL to the nearest second. */
export function msToRoundedSeconds(ms: number): number {
  return Math.floor((ms + 500) / 1000);
}
