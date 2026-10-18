// Glob-style pattern matching used by KEYS, SCAN MATCH and CONFIG GET.
//
// Supported syntax:
//   *   any sequence of characters (including empty)
//   ?   exactly one character
// Everything else matches literally. Character classes ([abc]) are not
// supported yet — see "Known gaps" in the README.
//
// Implemented as a linear-time two-pointer matcher with single-star
// backtracking (no regex, so key names with regex metacharacters are safe).

export function globMatch(pattern: string, text: string): boolean {
  let p = 0;
  let t = 0;
  let starP = -1;
  let starT = -1;

  while (t < text.length) {
    if (p < pattern.length && pattern[p] === "*") {
      starP = p++;
      starT = t;
    } else if (p < pattern.length && (pattern[p] === "?" || pattern[p] === text[t])) {
      p++;
      t++;
    } else if (starP !== -1) {
      p = starP + 1;
      t = ++starT;
    } else {
      return false;
    }
  }
  while (p < pattern.length && pattern[p] === "*") p++;
  return p === pattern.length;
}

/** True when the pattern contains no wildcard, i.e. it can only match itself. */
export function isLiteralPattern(pattern: string): boolean {
  return !/[*?]/.test(pattern);
}
