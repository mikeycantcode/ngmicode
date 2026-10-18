// Glob-style pattern matching used by KEYS, SCAN MATCH, CONFIG GET and
// PSUBSCRIBE.
//
// Supported syntax:
//   *        any sequence of characters (including empty)
//   ?        exactly one character
//   [abc]    one character from the set
//   [a-z]    one character in the inclusive range (reversed ranges are swapped)
//   [^abc]   one character NOT in the set
//   \x       the character x, literally (also inside a class)
// A "[" without a closing "]" is a literal "[". Everything else is literal
// (no regex, so key names with regex metacharacters are safe).

type Token =
  | { kind: "star" }
  | { kind: "any" }
  | { kind: "lit"; ch: string }
  | { kind: "class"; negate: boolean; singles: string[]; ranges: [string, string][] };

function compile(pattern: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*") {
      out.push({ kind: "star" });
      i++;
    } else if (c === "?") {
      out.push({ kind: "any" });
      i++;
    } else if (c === "\\") {
      // Trailing backslash matches itself.
      out.push({ kind: "lit", ch: i + 1 < pattern.length ? pattern[i + 1] : "\\" });
      i += 2;
    } else if (c === "[") {
      const parsed = parseClass(pattern, i);
      if (parsed) {
        out.push(parsed.token);
        i = parsed.next;
      } else {
        out.push({ kind: "lit", ch: "[" });
        i++;
      }
    } else {
      out.push({ kind: "lit", ch: c });
      i++;
    }
  }
  return out;
}

/** Parses a class starting at pattern[start] === "[". Returns null if unterminated. */
function parseClass(pattern: string, start: number): { token: Token; next: number } | null {
  let i = start + 1;
  let negate = false;
  if (pattern[i] === "^") {
    negate = true;
    i++;
  }
  const singles: string[] = [];
  const ranges: [string, string][] = [];
  const readChar = (): string | null => {
    if (i >= pattern.length) return null;
    if (pattern[i] === "\\" && i + 1 < pattern.length) {
      i += 2;
      return pattern[i - 1];
    }
    return pattern[i++];
  };
  while (i < pattern.length && pattern[i] !== "]") {
    const lo = readChar();
    if (lo === null) return null;
    if (pattern[i] === "-" && i + 1 < pattern.length && pattern[i + 1] !== "]") {
      i++;
      const hi = readChar();
      if (hi === null) return null;
      ranges.push(lo <= hi ? [lo, hi] : [hi, lo]);
    } else {
      singles.push(lo);
    }
  }
  if (i >= pattern.length) return null;
  return { token: { kind: "class", negate, singles, ranges }, next: i + 1 };
}

function matchOne(t: Token, ch: string): boolean {
  switch (t.kind) {
    case "any":
      return true;
    case "lit":
      return t.ch === ch;
    case "class": {
      const hit = t.singles.includes(ch) || t.ranges.some(([lo, hi]) => ch >= lo && ch <= hi);
      return t.negate ? !hit : hit;
    }
    case "star":
      return false;
  }
}

export function globMatch(pattern: string, text: string): boolean {
  const tokens = compile(pattern);
  let p = 0;
  let t = 0;
  let starP = -1;
  let starT = -1;

  while (t < text.length) {
    if (p < tokens.length && tokens[p].kind === "star") {
      starP = p++;
      starT = t;
    } else if (p < tokens.length && matchOne(tokens[p], text[t])) {
      p++;
      t++;
    } else if (starP !== -1) {
      p = starP + 1;
      t = ++starT;
    } else {
      return false;
    }
  }
  while (p < tokens.length && tokens[p].kind === "star") p++;
  return p === tokens.length;
}

/** True when the pattern contains no wildcard, i.e. it can only match itself. */
export function isLiteralPattern(pattern: string): boolean {
  return !/[*?[\\]/.test(pattern);
}
