import type { List, ListItem } from "../../core/ast";
import { indentOf, isBlank, stripIndent } from "../../util/strings";
import type { BlockRule } from "../blockParser";
import { canInterruptParagraph, FENCE_OPEN, LIST_MARKER } from "../patterns";

interface Marker {
  ordered: boolean;
  /** Bullet char or ordered delimiter. */
  char: string;
  start: number;
  /** Column where the item's content starts. */
  contentIndent: number;
  /** Text after the marker on the first line. */
  firstLine: string;
}

function readMarker(line: string): Marker | null {
  const m = LIST_MARKER.exec(line);
  if (!m) return null;
  const leading = m[1].length;
  const ordered = m[3] !== undefined;
  const markerLen = m[2].length;
  const spaces = m[5].length;
  const rest = line.slice(m[0].length);
  let contentIndent: number;
  let firstLine: string;
  if (isBlank(rest)) {
    // "-\n  foo": content starts one column after the marker.
    contentIndent = leading + markerLen + 1;
    firstLine = "";
  } else if (spaces > 4) {
    // "-      foo": treat as one space + indented content.
    contentIndent = leading + markerLen + 1;
    firstLine = line.slice(leading + markerLen + 1);
  } else {
    contentIndent = leading + markerLen + spaces;
    firstLine = rest;
  }
  return {
    ordered,
    char: ordered ? m[4] : m[2],
    start: ordered ? parseInt(m[3], 10) : 1,
    contentIndent,
    firstLine,
  };
}

function sameList(a: Marker, b: Marker): boolean {
  return a.ordered === b.ordered && a.char === b.char;
}

/**
 * A blank line inside an item makes the list loose when it separates two
 * direct children of the item (not when it sits inside a nested list or a
 * fenced code block).
 */
function hasBlankBetweenChildren(lines: string[]): boolean {
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (FENCE_OPEN.test(l) && indentOf(l) === 0) inFence = !inFence;
    if (inFence || !isBlank(l)) continue;
    const next = lines.slice(i + 1).find((x) => !isBlank(x));
    if (next !== undefined && indentOf(next) === 0) return true;
  }
  return false;
}

/**
 * Bullet and ordered lists. Each item's lines are collected by indentation,
 * de-indented, and parsed recursively as blocks.
 */
export const list: BlockRule = (r, ctx) => {
  const first = readMarker(r.peek()!);
  if (!first) return null;
  if (ctx.depth >= ctx.options.maxNesting) return null;

  const node: List = {
    type: "list",
    ordered: first.ordered,
    start: first.start,
    marker: first.char,
    tight: true,
    children: [],
    position: { line: r.lineNo() },
  };

  while (!r.eof()) {
    const marker = readMarker(r.peek()!);
    if (!marker || !sameList(first, marker)) break;

    const itemLine = r.lineNo();
    r.next();
    const lines: string[] = [marker.firstLine];
    while (!r.eof()) {
      const l = r.peek()!;
      if (isBlank(l)) {
        lines.push("");
        r.next();
        continue;
      }
      if (indentOf(l) >= marker.contentIndent) {
        lines.push(stripIndent(l, marker.contentIndent));
        r.next();
        continue;
      }
      // Lazy paragraph continuation: previous line is text, this line starts nothing new.
      const prev = lines[lines.length - 1];
      if (prev !== "" && !LIST_MARKER.test(l) && !canInterruptParagraph(l, ctx.options) && !canInterruptParagraph(prev, ctx.options)) {
        lines.push(l);
        r.next();
        continue;
      }
      break;
    }

    // Trailing blank lines belong between items, not inside this one.
    let trailingBlanks = 0;
    while (lines.length > 1 && lines[lines.length - 1] === "") {
      lines.pop();
      trailingBlanks++;
    }

    if (hasBlankBetweenChildren(lines)) node.tight = false;

    const item: ListItem = {
      type: "listItem",
      checked: null,
      children: ctx.parseBlocks(lines, itemLine, ctx.depth + 1),
      position: { line: itemLine },
    };
    node.children.push(item);

    // A blank line after an item ends the list (#212: "- a\n\nparagraph" used
    // to swallow the paragraph into the list).
    if (trailingBlanks > 0) break;
  }

  return node;
};
