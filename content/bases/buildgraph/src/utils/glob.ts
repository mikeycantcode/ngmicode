/**
 * Glob matching for workspace patterns, task inputs and outputs.
 * Supports `**`, `*`, `?`, `{a,b}` and a leading `!` (negation is handled by callers
 * via `matchAny`).
 */
const cache = new Map<string, RegExp>();

export function globToRegExp(pattern: string): RegExp {
  const hit = cache.get(pattern);
  if (hit) return hit;
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        // "**/" matches zero or more directories; a trailing "**" matches everything
        if (pattern[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 3;
        } else {
          re += ".*";
          i += 2;
        }
        continue;
      }
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "{") {
      const end = pattern.indexOf("}", i);
      if (end > i) {
        const alts = pattern.slice(i + 1, end).split(",").map(escape);
        re += `(?:${alts.join("|")})`;
        i = end + 1;
        continue;
      }
      re += "\\{";
    } else {
      re += escape(c);
    }
    i++;
  }
  const out = new RegExp(`^${re}$`);
  cache.set(pattern, out);
  return out;
}

function escape(s: string): string {
  return s.replace(/[.+^$()|[\]\\{}*?]/g, "\\$&");
}

export function matchGlob(pattern: string, path: string): boolean {
  return globToRegExp(pattern).test(path);
}

/**
 * Applies a list of patterns in order; `!pattern` removes previously matched paths.
 * Returns true if the path is included by the final state.
 */
export function matchAny(patterns: string[], path: string): boolean {
  let included = false;
  for (const p of patterns) {
    if (p.startsWith("!")) {
      if (included && matchGlob(p.slice(1), path)) included = false;
    } else if (!included && matchGlob(p, path)) {
      included = true;
    }
  }
  return included;
}

/** @deprecated prefix matching from the v0.1 config format. Use matchGlob. */
export function simpleMatch(pattern: string, path: string): boolean {
  return pattern.endsWith("*") ? path.startsWith(pattern.slice(0, -1)) : pattern === path;
}
