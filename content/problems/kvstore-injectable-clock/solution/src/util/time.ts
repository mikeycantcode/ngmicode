// Pure time-unit helpers. There is deliberately no "now" here: current time
// always comes from the injected Clock (`store.clock` / `ctx.clock`).

export function secondsToMs(seconds: number): number {
  return seconds * 1000;
}

/** Redis rounds TTL to the nearest second. */
export function msToRoundedSeconds(ms: number): number {
  return Math.floor((ms + 500) / 1000);
}
