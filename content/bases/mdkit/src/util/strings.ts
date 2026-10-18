// Small string helpers shared by the block and inline parsers.

export function normalizeNewlines(src: string): string {
  return src.replace(/\r\n?/g, "\n");
}

export function isBlank(line: string): boolean {
  return /^[ \t]*$/.test(line);
}

/** Visual indentation width of a line, with tabs expanded to 4-column stops. */
export function indentOf(line: string): number {
  let n = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === " ") n++;
    else if (ch === "\t") n += 4 - (n % 4);
    else break;
  }
  return n;
}

/** Removes up to `cols` columns of leading indentation (tabs expanded). */
export function stripIndent(line: string, cols: number): string {
  let n = 0;
  let i = 0;
  while (i < line.length && n < cols) {
    const ch = line[i];
    if (ch === " ") n++;
    else if (ch === "\t") {
      const w = 4 - (n % 4);
      if (n + w > cols) {
        // Partially consumed tab: keep the remainder as spaces.
        return " ".repeat(n + w - cols) + line.slice(i + 1);
      }
      n += w;
    } else break;
    i++;
  }
  return line.slice(i);
}

const ASCII_PUNCT = new Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~".split(""));

export function isAsciiPunct(ch: string): boolean {
  return ASCII_PUNCT.has(ch);
}

export function isWhitespace(ch: string | undefined): boolean {
  return ch === undefined || /\s/.test(ch);
}

export function isPunctuation(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  return ASCII_PUNCT.has(ch) || /[\p{P}\p{S}]/u.test(ch);
}

/**
 * @deprecated Use `indentOf`, which handles tabs. Kept because the v1 plugin
 * API exported it and a couple of internal plugins still import it.
 */
export function countLeadingSpaces(s: string): number {
  let n = 0;
  while (s[n] === " ") n++;
  return n;
}

/**
 * Removes trailing spaces and tabs. Written as a loop on purpose: the obvious
 * `/[ \t]+$/` regex is quadratic on long runs of inner whitespace (ReDoS).
 */
export function trimEndSpaces(s: string): string {
  let end = s.length;
  while (end > 0 && (s[end - 1] === " " || s[end - 1] === "\t")) end--;
  return end === s.length ? s : s.slice(0, end);
}

/** "## Title ##" -> "Title"; a closing sequence must be preceded by a space or tab. */
export function trimTrailingHashes(s: string): string {
  const t = trimEndSpaces(s);
  let i = t.length;
  while (i > 0 && t[i - 1] === "#") i--;
  if (i === t.length) return t.trim();
  if (i === 0) return "";
  if (t[i - 1] === " " || t[i - 1] === "\t") return t.slice(0, i).trim();
  return t.trim();
}
