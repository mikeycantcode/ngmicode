// Links and images: `[text](dest "title")`, `[text][ref]`, `[ref][]`, `[ref]`
// and the image forms of each.

import type { Image, InlineNode, Link } from "../core/ast";
import { toText } from "../core/ast";
import { normalizeLabel } from "../core/options";
import { unescapeAll } from "../util/escape";
import { encodeUrl } from "../util/url";
import { processEmphasis } from "./emphasis";
import type { InlineState } from "./state";

const MAX_PAREN_DEPTH = 32;

interface LinkTail {
  href: string;
  title: string | null;
  /** Source offset just past the closing `)`. */
  end: number;
}

function skipSpace(src: string, i: number): number {
  let newlines = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t") i++;
    else if (ch === "\n" && newlines === 0) {
      newlines++;
      i++;
    } else break;
  }
  return i;
}

/** Parses `(dest "title")` starting at `start` (which must be `(`). */
export function parseLinkTail(src: string, start: number): LinkTail | null {
  let i = skipSpace(src, start + 1);
  let dest = "";

  if (src[i] === "<") {
    const close = src.indexOf(">", i + 1);
    if (close === -1) return null;
    const inner = src.slice(i + 1, close);
    if (/[<\n]/.test(inner)) return null;
    dest = inner;
    i = close + 1;
  } else {
    let depth = 0;
    const begin = i;
    while (i < src.length) {
      const ch = src[i];
      if (ch === "\\" && i + 1 < src.length) {
        i += 2;
        continue;
      }
      if (ch === "(") {
        depth++;
        if (depth > MAX_PAREN_DEPTH) return null;
      } else if (ch === ")") {
        if (depth === 0) break;
        depth--;
      } else if (ch.charCodeAt(0) <= 0x20) break;
      i++;
    }
    if (depth !== 0) return null;
    dest = src.slice(begin, i);
  }

  const afterDest = i;
  i = skipSpace(src, i);
  let title: string | null = null;
  const q = src[i];
  if (i > afterDest && (q === '"' || q === "'" || q === "(")) {
    const closeCh = q === "(" ? ")" : q;
    let j = i + 1;
    while (j < src.length && src[j] !== closeCh) {
      if (src[j] === "\\") j++;
      j++;
    }
    if (j >= src.length) return null;
    title = unescapeAll(src.slice(i + 1, j));
    i = skipSpace(src, j + 1);
  }
  if (src[i] !== ")") return null;
  return { href: encodeUrl(unescapeAll(dest)), title, end: i + 1 };
}

/** Reads a `[label]` at `start`; returns the label and end offset. */
function parseLabel(src: string, start: number): { label: string; end: number } | null {
  if (src[start] !== "[") return null;
  let i = start + 1;
  while (i < src.length && src[i] !== "]") {
    if (src[i] === "[") return null;
    if (src[i] === "\\") i++;
    i++;
  }
  if (i >= src.length || i - start > 1000) return null;
  return { label: src.slice(start + 1, i), end: i + 1 };
}

/** Handles `[` and `![` (state.pos is at the `[` or `!`). */
export function openBracket(state: InlineState, image: boolean): void {
  const text = image ? "![" : "[";
  const slot = state.appendMarker(text);
  state.pos += text.length;
  state.brackets.push({ slot, image, active: true, delimBottom: state.delims.length, textStart: state.pos });
}

/** Handles `]`: tries to close the most recent bracket as a link or image. */
export function closeBracket(state: InlineState): void {
  const { src } = state;
  const opener = state.brackets[state.brackets.length - 1];
  if (!opener) {
    state.pending += "]";
    state.pos++;
    return;
  }
  if (!opener.active) {
    state.brackets.pop();
    state.pending += "]";
    state.pos++;
    return;
  }

  const closePos = state.pos;
  let href: string | null = null;
  let title: string | null = null;
  let end = closePos + 1;

  if (src[closePos + 1] === "(") {
    const tail = parseLinkTail(src, closePos + 1);
    if (tail) {
      href = tail.href;
      title = tail.title;
      end = tail.end;
    }
  }

  if (href === null) {
    // Reference forms: [text][label], [label][], [label]
    const lbl = parseLabel(src, closePos + 1);
    let label: string;
    if (lbl && lbl.label.trim()) {
      label = lbl.label;
      end = lbl.end;
    } else {
      label = src.slice(opener.textStart, closePos);
      if (lbl) end = lbl.end; // collapsed `[]`
    }
    const ref = state.env.references.get(normalizeLabel(label));
    if (ref) {
      href = ref.href;
      title = ref.title;
    } else {
      end = closePos + 1;
    }
  }

  if (href === null) {
    state.brackets.pop();
    state.pending += "]";
    state.pos++;
    return;
  }

  state.flush();
  processEmphasis(state, opener.delimBottom);
  const children: InlineNode[] = state.takeAfter(opener.slot);
  state.unlink(opener.slot);
  state.brackets.pop();

  let node: Link | Image;
  if (opener.image) {
    node = { type: "image", src: href, title, alt: children.map(toText).join("") };
  } else {
    node = { type: "link", href, title, children };
    // No links inside links: deactivate enclosing link openers.
    for (const b of state.brackets) if (!b.image) b.active = false;
  }
  state.append(node);
  state.pos = end;
}
