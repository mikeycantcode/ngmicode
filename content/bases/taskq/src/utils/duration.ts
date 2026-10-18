const UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parse "250ms", "5s", "1.5m", "2h", "1d" or a bare number (ms) into ms.
 * Throws RangeError on anything else.
 */
export function parseDuration(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) throw new RangeError(`invalid duration: ${input}`);
    return input;
  }
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?\s*$/.exec(input);
  if (!m) throw new RangeError(`invalid duration: "${input}"`);
  const value = Number(m[1]) * UNITS[m[2] ?? "ms"];
  return Math.round(value);
}

/** Human-readable duration, e.g. 90500 -> "1m30.5s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const parts: string[] = [];
  let rest = ms;
  for (const [unit, size] of [
    ["d", UNITS.d],
    ["h", UNITS.h],
    ["m", UNITS.m],
  ] as const) {
    if (rest >= size) {
      parts.push(`${Math.floor(rest / size)}${unit}`);
      rest %= size;
    }
  }
  if (rest) parts.push(`${rest / 1000}s`);
  return parts.join("");
}

/**
 * @deprecated use parseDuration. Kept for the v0 config loader, which passed
 * seconds as numbers (!). Do not use in new code.
 */
export function toMs(value: string | number): number {
  return typeof value === "number" ? value * 1000 : parseDuration(value);
}
