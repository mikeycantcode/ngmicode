import type { Align, Table, TableCell, TableRow } from "../../core/ast";
import { isBlank } from "../../util/strings";
import type { BlockRule } from "../blockParser";
import { canInterruptParagraph } from "../patterns";

const DELIM_CELL = /^:?-+:?$/;

/** Splits a table row into trimmed cell sources. Leading and trailing pipes are optional. */
export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left) return "left";
  if (right) return "right";
  if (left && right) return "center";
  return null;
}

function makeRow(cells: string[], width: number, header: boolean, line: number): TableRow {
  // TODO: normalize row width to `width`?
  return {
    type: "tableRow",
    header,
    position: { line },
    children: cells.map((raw): TableCell => ({ type: "tableCell", raw, children: [] })),
  };
}

/**
 * GFM pipe tables. A header row followed by a delimiter row with the same
 * number of cells; body rows continue until a blank line or another block.
 */
export const table: BlockRule = (r, ctx) => {
  if (!ctx.options.tables) return null;
  const head = r.peek()!;
  const delim = r.peek(1);
  if (delim === undefined || !head.includes("|")) return null;
  if (!/^[ \t|:-]+$/.test(delim) || !delim.includes("-")) return null;

  const delimCells = splitRow(delim);
  if (!delimCells.every((c) => DELIM_CELL.test(c))) return null;
  const headCells = splitRow(head);
  if (headCells.length !== delimCells.length) return null;

  const line = r.lineNo();
  const width = headCells.length;
  const node: Table = {
    type: "table",
    align: delimCells.map(alignOf),
    children: [makeRow(headCells, width, true, line)],
    position: { line },
  };
  r.next();
  r.next();

  while (!r.eof()) {
    const l = r.peek()!;
    if (isBlank(l) || canInterruptParagraph(l, ctx.options)) break;
    node.children.push(makeRow(splitRow(l), width, false, r.lineNo()));
    r.next();
  }
  return node;
};
