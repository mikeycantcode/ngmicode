// Inline parser: turns the `raw` source of headings, paragraphs and table
// cells into inline nodes.

import type { InlineNode, Root } from "../core/ast";
import { walk } from "../core/ast";
import type { Env, ParseOptions } from "../core/options";
import { processEmphasis, scanDelimiterRun } from "./emphasis";
import { closeBracket, openBracket } from "./links";
import { angle, codeSpan, entity, escape, newline } from "./rules";
import { InlineState } from "./state";

const SPECIAL = new Set(["\\", "`", "*", "_", "[", "]", "!", "<", "&", "\n"]);

export function parseInline(src: string, options: ParseOptions, env: Env): InlineNode[] {
  const state = new InlineState(src, options, env);
  while (state.pos < src.length) {
    const ch = src[state.pos];
    switch (ch) {
      case "\\":
        escape(state);
        break;
      case "`":
        codeSpan(state);
        break;
      case "*":
      case "_":
        scanDelimiterRun(state);
        break;
      case "[":
        openBracket(state, false);
        break;
      case "!":
        if (src[state.pos + 1] === "[") openBracket(state, true);
        else {
          state.pending += "!";
          state.pos++;
        }
        break;
      case "]":
        closeBracket(state);
        break;
      case "<":
        angle(state);
        break;
      case "&":
        entity(state);
        break;
      case "\n":
        newline(state);
        break;
      default: {
        // Fast-forward over ordinary text.
        let end = state.pos + 1;
        while (end < src.length && !SPECIAL.has(src[end])) end++;
        state.pending += src.slice(state.pos, end);
        state.pos = end;
      }
    }
  }
  state.flush();
  processEmphasis(state, 0);
  return state.toNodes();
}

/** Fills `children` of every heading, paragraph and table cell from its `raw`. */
export function parseInlines(root: Root, options: ParseOptions, env: Env): void {
  walk(root, (node) => {
    if (node.type === "heading" || node.type === "paragraph" || node.type === "tableCell") {
      node.children = parseInline(node.raw, options, env);
      return "skip";
    }
  });
}
