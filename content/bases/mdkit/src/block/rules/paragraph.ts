import type { Heading, Paragraph } from "../../core/ast";
import type { Env } from "../../core/options";
import { normalizeLabel } from "../../core/options";
import { unescapeAll } from "../../util/escape";
import { encodeUrl } from "../../util/url";
import { isBlank, trimEndSpaces } from "../../util/strings";
import { type BlockRule, NOTHING } from "../blockParser";
import { canInterruptParagraph, SETEXT_UNDERLINE } from "../patterns";

// [label]: destination "optional title"
const REF_HEAD = /^ {0,3}\[((?:[^\\\[\]]|\\.){1,999})\]:/;

interface RefDef {
  label: string;
  dest: string;
  title: string | null;
  /** Characters consumed, including the trailing newline. */
  length: number;
}

function skipSpaces(s: string, i: number, allowNewline: boolean): number {
  let sawNewline = false;
  while (i < s.length) {
    if (s[i] === " " || s[i] === "\t") i++;
    else if (s[i] === "\n" && allowNewline && !sawNewline) {
      sawNewline = true;
      i++;
    } else break;
  }
  return i;
}

/** End of the line at `i` if only spaces/tabs remain on it, else -1. */
function lineEnd(s: string, i: number): number {
  const k = skipSpaces(s, i, false);
  if (k === s.length) return k;
  return s[k] === "\n" ? k + 1 : -1;
}

// Hand-written rather than one big regex: the regex version backtracked
// quadratically on long runs of spaces between destination and title.
function parseRefDef(s: string): RefDef | null {
  const m = REF_HEAD.exec(s);
  if (!m) return null;
  let i = skipSpaces(s, m[0].length, true);

  let dest: string;
  if (s[i] === "<") {
    const close = s.indexOf(">", i + 1);
    if (close === -1) return null;
    dest = s.slice(i + 1, close);
    if (/[<\n]/.test(dest)) return null;
    i = close + 1;
  } else {
    const begin = i;
    while (i < s.length && s.charCodeAt(i) > 0x20) i++;
    if (i === begin) return null;
    dest = s.slice(begin, i);
  }

  const afterDest = i;
  const t = skipSpaces(s, i, true);
  const q = s[t];
  if (t > afterDest && (q === '"' || q === "'" || q === "(")) {
    const closeCh = q === "(" ? ")" : q;
    let j = t + 1;
    while (j < s.length && s[j] !== closeCh) j += s[j] === "\\" ? 2 : 1;
    if (j < s.length) {
      const end = lineEnd(s, j + 1);
      if (end !== -1) return { label: m[1], dest, title: unescapeAll(s.slice(t + 1, j)), length: end };
    }
  }
  const end = lineEnd(s, afterDest);
  if (end === -1) return null;
  return { label: m[1], dest, title: null, length: end };
}

/**
 * Strips link reference definitions from the start of a paragraph's source,
 * registering them in env.references (first definition wins). Returns the
 * remaining source.
 */
export function extractReferences(raw: string, env: Env): string {
  let rest = raw;
  for (;;) {
    const def = parseRefDef(rest);
    if (!def) break;
    const label = normalizeLabel(def.label);
    if (!label) break;
    if (!env.references.has(label)) {
      env.references.set(label, { href: encodeUrl(unescapeAll(def.dest)), title: def.title });
    }
    rest = rest.slice(def.length);
  }
  return rest;
}

/**
 * Paragraphs, setext headings (`Title\n=====`) and link reference
 * definitions. Accepts any non-blank line, so it must be the last rule.
 */
export const paragraph: BlockRule = (r, ctx) => {
  const line = r.lineNo();
  const lines: string[] = [r.next().replace(/^[ \t]+/, "")];

  while (!r.eof()) {
    const l = r.peek()!;
    if (isBlank(l)) break;
    const setext = SETEXT_UNDERLINE.exec(l);
    if (setext) {
      r.next();
      const raw = extractReferences(lines.join("\n"), ctx.env).trim();
      if (!raw) {
        // Only reference definitions above the underline; it is just a paragraph.
        const p: Paragraph = { type: "paragraph", raw: l.trim(), children: [], position: { line } };
        return p;
      }
      const h: Heading = {
        type: "heading",
        depth: setext[1][0] === "=" ? 1 : 2,
        raw,
        children: [],
        position: { line },
      };
      return h;
    }
    if (canInterruptParagraph(l, ctx.options)) break;
    lines.push(l.replace(/^[ \t]+/, ""));
    r.next();
  }

  const raw = trimEndSpaces(extractReferences(lines.join("\n"), ctx.env));
  if (!raw.trim()) return NOTHING;
  const p: Paragraph = { type: "paragraph", raw, children: [], position: { line } };
  return p;
};
