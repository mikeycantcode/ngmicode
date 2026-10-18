import { fromHex, toHex } from "../util/common";

// History cursors are opaque to clients. They point at the last message the
// client has seen; the next page starts strictly after it. The id is carried
// along for debugging/log correlation.

export interface CursorPosition {
  createdAt: number;
  id: string;
}

const PREFIX = "c1";

export function encodeCursor(pos: CursorPosition): string {
  return PREFIX + toHex(`${pos.createdAt}|${pos.id}`);
}

export function decodeCursor(cursor: string): CursorPosition | null {
  if (!cursor.startsWith(PREFIX)) return null;
  const raw = fromHex(cursor.slice(PREFIX.length));
  if (raw === null) return null;
  const bar = raw.indexOf("|");
  if (bar < 0) return null;
  const createdAt = Number(raw.slice(0, bar));
  const id = raw.slice(bar + 1);
  if (!Number.isFinite(createdAt) || !id) return null;
  return { createdAt, id };
}

/** Total order used everywhere messages are sorted: createdAt, then id. */
export function compareMessagePos(a: CursorPosition, b: CursorPosition): number {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
