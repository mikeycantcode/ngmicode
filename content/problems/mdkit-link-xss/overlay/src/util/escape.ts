// HTML escaping and Markdown backslash-unescaping.

import { decodeEntities } from "./entities";
import { isAsciiPunct } from "./strings";

const TEXT_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

/**
 * Escapes text content. Quotes are not special in text nodes, so we leave
 * them alone (smaller output, and the search snippets stop showing &quot;).
 */
export function escapeHtml(s: string): string {
  if (!/[&<>]/.test(s)) return s;
  return s.replace(/[&<>]/g, (c) => TEXT_ESCAPES[c]);
}

/** Escapes a value for use inside a double- or single-quoted attribute. */
export function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

/** Removes Markdown backslash escapes (`\*` -> `*`). */
export function unescapeBackslashes(s: string): string {
  if (s.indexOf("\\") === -1) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length && isAsciiPunct(s[i + 1])) {
      out += s[i + 1];
      i++;
    } else out += s[i];
  }
  return out;
}

/** Backslash escapes + entity references, as CommonMark does for link destinations and titles. */
export function unescapeAll(s: string): string {
  return decodeEntities(unescapeBackslashes(s));
}
