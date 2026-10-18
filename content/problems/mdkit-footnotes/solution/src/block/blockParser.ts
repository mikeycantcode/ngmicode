// Block-level parser. Splits a document into lines and runs the block rules
// over them. Container blocks (blockquotes, list items) strip their markers
// and recurse via `ctx.parseBlocks`, so every rule works on plain lines.
//
// Indented code blocks are intentionally NOT supported: they cause more
// surprises in user content than they solve. Use fences.

import type { BlockNode, Root } from "../core/ast";
import { MdkitError } from "../core/errors";
import type { Env, ParseOptions } from "../core/options";
import { isBlank, normalizeNewlines } from "../util/strings";
import { LineReader } from "./lineReader";
import { blockquote } from "./rules/blockquote";
import { fence } from "./rules/fence";
import { footnoteDefinition } from "./rules/footnote";
import { htmlBlock } from "./rules/htmlBlock";
import { atxHeading, hr } from "./rules/leaf";
import { list } from "./rules/list";
import { paragraph } from "./rules/paragraph";
import { table } from "./rules/table";

/** Returned by a rule that consumed lines but produced no node (e.g. link reference definitions). */
export const NOTHING = Symbol("nothing");

export type RuleResult = BlockNode | typeof NOTHING | null;

export interface BlockContext {
  options: ParseOptions;
  env: Env;
  /** Container nesting depth (0 = document). */
  depth: number;
  parseBlocks(lines: string[], firstLine: number, depth: number): BlockNode[];
}

export type BlockRule = (r: LineReader, ctx: BlockContext) => RuleResult;

// Order matters: thematic breaks must be tried before lists (`* * *`), and
// paragraph must be last because it accepts anything.
const RULES: ReadonlyArray<[string, BlockRule]> = [
  ["fence", fence],
  ["heading", atxHeading],
  ["hr", hr],
  ["blockquote", blockquote],
  ["list", list],
  ["footnote", footnoteDefinition],
  ["table", table],
  ["html", htmlBlock],
  ["paragraph", paragraph],
];

function runRules(r: LineReader, ctx: BlockContext): BlockNode[] {
  const out: BlockNode[] = [];
  while (!r.eof()) {
    if (isBlank(r.peek()!)) {
      r.next();
      continue;
    }
    const before = r.pos;
    for (const [name, rule] of RULES) {
      const res = rule(r, ctx);
      if (res === null) {
        r.pos = before;
        continue;
      }
      if (r.pos === before) throw new MdkitError("E_INTERNAL", `block rule "${name}" matched without consuming input`);
      if (res !== NOTHING) out.push(res);
      break;
    }
  }
  return out;
}

export function makeContext(options: ParseOptions, env: Env, depth = 0): BlockContext {
  const ctx: BlockContext = {
    options,
    env,
    depth,
    parseBlocks(lines, firstLine, d) {
      return runRules(new LineReader(lines, firstLine), makeContext(options, env, d));
    },
  };
  return ctx;
}

/**
 * Parses the block structure of a document. Inline content is left in the
 * `raw` field of headings, paragraphs and table cells; see inline/inlineParser.
 *
 * @param firstLine 1-based line number of the first line of `src` in the
 *   original document (non-1 when front matter was stripped).
 */
export function parseBlocks(src: string, options: ParseOptions, env: Env, firstLine = 1): Root {
  const reader = LineReader.fromSource(normalizeNewlines(src), firstLine);
  const children = runRules(reader, makeContext(options, env, 0));
  return { type: "root", children };
}
