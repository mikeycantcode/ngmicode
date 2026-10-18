import type { Heading, Paragraph } from "../../core/ast";
import type { Env } from "../../core/options";
import { normalizeLabel } from "../../core/options";
import { unescapeAll } from "../../util/escape";
import { encodeUrl } from "../../util/url";
import { isBlank } from "../../util/strings";
import { type BlockRule, NOTHING } from "../blockParser";
import { canInterruptParagraph, SETEXT_UNDERLINE } from "../patterns";

// [label]: destination "optional title"
const REF_DEF =
  /^ {0,3}\[((?:[^\\\[\]]|\\.){1,999})\]:[ \t]*\n?[ \t]*(<[^<>\n]*>|\S+)(?:(?:[ \t]+|[ \t]*\n[ \t]*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^()\\]|\\.)*\)))?[ \t]*(?:\n|$)/;

/**
 * Strips link reference definitions from the start of a paragraph's source,
 * registering them in env.references (first definition wins). Returns the
 * remaining source.
 */
export function extractReferences(raw: string, env: Env): string {
  let rest = raw;
  for (;;) {
    const m = REF_DEF.exec(rest);
    if (!m) break;
    const label = normalizeLabel(m[1]);
    if (!label) break;
    let dest = m[2];
    if (dest.startsWith("<")) dest = dest.slice(1, -1);
    const title = m[3] ? unescapeAll(m[3].slice(1, -1)) : null;
    if (!env.references.has(label)) {
      env.references.set(label, { href: encodeUrl(unescapeAll(dest)), title });
    }
    rest = rest.slice(m[0].length);
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

  const raw = extractReferences(lines.join("\n"), ctx.env).replace(/[ \t]+$/, "");
  if (!raw.trim()) return NOTHING;
  const p: Paragraph = { type: "paragraph", raw, children: [], position: { line } };
  return p;
};
