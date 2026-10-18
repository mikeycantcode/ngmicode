import type { Align, Table, TableCell, TableRow } from "../../core/ast";
import { isBlank } from "../../util/strings";
import type { BlockRule } from "../blockParser";
import { canInterruptParagraph } from "../patterns";

const DELIM_CELL = /^:?-+:?$/;

/**
 * Splits a table row into trimmed cell sources. Leading and trailing pipes are
 * optional. `\|` is an escaped pipe: it does not split, and it becomes a
 * literal `|` in the cell (even inside code spans, per GFM).
 */
export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

function makeRow(cells: string[], width: number, header: boolean, line: number): TableRow {
  // Short rows are padded with empty cells; excess cells are ignored.
  const normalized: string[] = [];
  for (let i = 0; i < width; i++) normalized.push(cells[i] ?? "");
  return {
    type: "tableRow",
    header,
    position: { line },
    children: normalized.map((raw): TableCell => ({ type: "tableCell", raw, children: [] })),
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
