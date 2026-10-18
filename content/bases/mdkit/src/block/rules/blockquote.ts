import type { Blockquote } from "../../core/ast";
import { isBlank } from "../../util/strings";
import type { BlockRule } from "../blockParser";
import { BLOCKQUOTE, canInterruptParagraph, FENCE_OPEN } from "../patterns";

/**
 * Blockquotes. Collects consecutive `>` lines (plus lazy paragraph
 * continuation lines), strips the markers and parses the result recursively.
 */
export const blockquote: BlockRule = (r, ctx) => {
  if (!BLOCKQUOTE.test(r.peek()!)) return null;
  // Past the nesting limit we let the paragraph rule swallow the line.
  if (ctx.depth >= ctx.options.maxNesting) return null;

  const line = r.lineNo();
  const inner: string[] = [];
  let inParagraph = false;
  let inFence = false;
  while (!r.eof()) {
    const l = r.peek()!;
    const m = BLOCKQUOTE.exec(l);
    if (m) {
      const content = l.slice(m[0].length);
      inner.push(content);
      if (FENCE_OPEN.test(content)) inFence = !inFence;
      inParagraph = !inFence && !isBlank(content) && !canInterruptParagraph(content, ctx.options);
      r.next();
      continue;
    }
    if (isBlank(l)) break;
    // Lazy continuation: "> foo\nbar" is one paragraph.
    if (inParagraph && !canInterruptParagraph(l, ctx.options)) {
      inner.push(l);
      r.next();
      continue;
    }
    break;
  }

  const node: Blockquote = {
    type: "blockquote",
    children: ctx.parseBlocks(inner, line, ctx.depth + 1),
    position: { line },
  };
  return node;
};
