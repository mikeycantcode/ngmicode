import type { Heading } from "../../core/ast";
import { trimTrailingHashes } from "../../util/strings";
import type { BlockRule } from "../blockParser";
import { ATX_HEADING, THEMATIC_BREAK } from "../patterns";

// Single-line leaf blocks: ATX headings and thematic breaks.

/** ATX headings: `# Title`, `## Title ##`. Setext headings live in paragraph.ts. */
export const atxHeading: BlockRule = (r) => {
  const m = ATX_HEADING.exec(r.peek()!);
  if (!m) return null;
  const line = r.lineNo();
  r.next();
  const node: Heading = {
    type: "heading",
    depth: m[1].length as Heading["depth"],
    raw: trimTrailingHashes(m[2] ?? ""),
    children: [],
    position: { line },
  };
  return node;
};

/** Thematic breaks: `---`, `***`, `_ _ _`. */
export const hr: BlockRule = (r) => {
  if (!THEMATIC_BREAK.test(r.peek()!)) return null;
  const line = r.lineNo();
  r.next();
  return { type: "thematicBreak", position: { line } };
};
