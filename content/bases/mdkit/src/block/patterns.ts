// Line-start patterns shared by several block rules. Kept in one place because
// "can this line interrupt a paragraph?" needs to know about all of them.

import type { ParseOptions } from "../core/options";
import { isBlank } from "../util/strings";

export const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/;
export const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;
export const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
export const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
export const BLOCKQUOTE = /^ {0,3}> ?/;
/** 1: leading spaces, 2: marker, 3: digits (ordered only), 4: delimiter (ordered only), 5: spaces after. */
export const LIST_MARKER = /^( {0,3})([*+-]|(\d{1,9})([.)]))([ \t]+|$)/;
export const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;

const BLOCK_TAGS = [
  "address", "article", "aside", "blockquote", "details", "dialog", "div", "dl", "fieldset",
  "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr",
  "iframe", "li", "main", "nav", "ol", "p", "pre", "script", "section", "style", "summary",
  "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
];
export const HTML_BLOCK_START = new RegExp(`^ {0,3}(?:<!--|<\\/?(?:${BLOCK_TAGS.join("|")})(?=[\\s/>]|$))`, "i");

/**
 * True if `line` starts a block construct that may interrupt a paragraph.
 * Per CommonMark, an ordered list can only interrupt a paragraph if it starts
 * at 1, and an empty list item can never interrupt one.
 */
export function canInterruptParagraph(line: string, options: ParseOptions): boolean {
  if (ATX_HEADING.test(line)) return true;
  if (FENCE_OPEN.test(line)) {
    const m = FENCE_OPEN.exec(line)!;
    if (!(m[2][0] === "`" && m[3].includes("`"))) return true;
  }
  if (THEMATIC_BREAK.test(line)) return true;
  if (BLOCKQUOTE.test(line)) return true;
  if (options.html && HTML_BLOCK_START.test(line)) return true;
  const m = LIST_MARKER.exec(line);
  if (m && !isBlank(line.slice(m[0].length))) {
    if (m[3] === undefined || m[3] === "1") return true;
  }
  return false;
}
