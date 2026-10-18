import type { FootnoteDefinition } from "../../core/ast";
import { footnoteState, normalizeLabel } from "../../core/options";
import { isBlank } from "../../util/strings";
import type { BlockRule } from "../blockParser";
import { canInterruptParagraph } from "../patterns";

export const FOOTNOTE_DEF = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]*(.*)$/;

/**
 * Footnote definitions: `[^label]: text`, continuing over the following
 * non-blank lines. Must run before the paragraph rule, which would otherwise
 * read the line as a link reference definition.
 */
export const footnoteDefinition: BlockRule = (r, ctx) => {
  if (!ctx.options.footnotes) return null;
  const m = FOOTNOTE_DEF.exec(r.peek()!);
  if (!m) return null;
  const line = r.lineNo();
  r.next();
  const lines = [m[2]];
  while (!r.eof()) {
    const l = r.peek()!;
    if (isBlank(l) || FOOTNOTE_DEF.test(l) || canInterruptParagraph(l, ctx.options)) break;
    lines.push(l.replace(/^[ \t]+/, ""));
    r.next();
  }
  const node: FootnoteDefinition = {
    type: "footnoteDefinition",
    label: normalizeLabel(m[1]),
    children: ctx.parseBlocks(lines, line, ctx.depth + 1),
    position: { line },
  };
  const st = footnoteState(ctx.env);
  if (!st.defs.has(node.label)) st.defs.set(node.label, node);
  return node;
};
