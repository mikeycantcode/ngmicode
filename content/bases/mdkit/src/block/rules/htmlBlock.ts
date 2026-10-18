import type { HtmlBlock } from "../../core/ast";
import { isBlank } from "../../util/strings";
import type { BlockRule } from "../blockParser";
import { HTML_BLOCK_START } from "../patterns";

/**
 * Raw HTML blocks (only when `options.html` is on). A simplification of the
 * CommonMark rules: starts at a known block-level tag or comment and runs to
 * the next blank line.
 */
export const htmlBlock: BlockRule = (r, ctx) => {
  if (!ctx.options.html) return null;
  if (!HTML_BLOCK_START.test(r.peek()!)) return null;
  const line = r.lineNo();
  const lines: string[] = [];
  while (!r.eof() && !isBlank(r.peek()!)) lines.push(r.next());
  const node: HtmlBlock = { type: "html", value: lines.join("\n") + "\n", position: { line } };
  return node;
};
