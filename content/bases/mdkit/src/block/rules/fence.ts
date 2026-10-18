import type { CodeBlock } from "../../core/ast";
import { unescapeAll } from "../../util/escape";
import { stripIndent } from "../../util/strings";
import type { BlockRule } from "../blockParser";
import { FENCE_CLOSE, FENCE_OPEN } from "../patterns";

/**
 * Fenced code blocks. The closing fence must use the same character and be at
 * least as long as the opening one. An unclosed fence runs to the end of its
 * container. Content lines lose up to as much indentation as the opener had.
 */
export const fence: BlockRule = (r) => {
  const m = FENCE_OPEN.exec(r.peek()!);
  if (!m) return null;
  const indent = m[1].length;
  const marker = m[2];
  const info = m[3].trim();
  // Backtick fences may not have backticks in the info string (it would be an inline code span).
  if (marker[0] === "`" && info.includes("`")) return null;

  const line = r.lineNo();
  r.next();
  const body: string[] = [];
  while (!r.eof()) {
    const l = r.next();
    const close = FENCE_CLOSE.exec(l);
    if (close && close[1][0] === marker[0] && close[1].length >= marker.length) break;
    body.push(stripIndent(l, indent));
  }

  const decodedInfo = unescapeAll(info);
  const node: CodeBlock = {
    type: "code",
    lang: decodedInfo ? decodedInfo.split(/\s+/)[0] : null,
    info: decodedInfo,
    value: body.length ? body.join("\n") + "\n" : "",
    position: { line },
  };
  return node;
};
