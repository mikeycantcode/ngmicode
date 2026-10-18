// Channel pattern matching for PSUBSCRIBE.
//
// NOTE: this predates src/util/glob.ts and was kept separate because the
// recursive version was "fast enough" for the handful of patterns clients
// register. TODO: dedupe with util/glob once someone has time to benchmark.
// Supports * and ? only.

export function patternMatch(pattern: string, channel: string, pi = 0, ci = 0): boolean {
  while (pi < pattern.length) {
    const p = pattern[pi];
    if (p === "*") {
      // collapse consecutive stars
      while (pi < pattern.length && pattern[pi] === "*") pi++;
      if (pi === pattern.length) return true;
      for (let k = ci; k <= channel.length; k++) {
        if (patternMatch(pattern, channel, pi, k)) return true;
      }
      return false;
    }
    if (ci >= channel.length) return false;
    if (p !== "?" && p !== channel[ci]) return false;
    pi++;
    ci++;
  }
  return ci === channel.length;
}
