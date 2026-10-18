// Emphasis: delimiter runs and the CommonMark "process emphasis" algorithm.

import type { Emphasis, InlineNode, Strong } from "../core/ast";
import { isPunctuation, isWhitespace } from "../util/strings";
import type { Delimiter, InlineState, Slot } from "./state";

/** Scans a run of `*` or `_` at state.pos and pushes it as a delimiter. */
export function scanDelimiterRun(state: InlineState): void {
  const { src } = state;
  const char = src[state.pos] as "*" | "_";
  let end = state.pos;
  while (src[end] === char) end++;
  const run = end - state.pos;

  const before = state.pos > 0 ? src[state.pos - 1] : undefined;
  const after = src[end];

  const leftFlanking = !isWhitespace(after) && (!isPunctuation(after) || isWhitespace(before) || isPunctuation(before));
  const rightFlanking = !isWhitespace(before) && (!isPunctuation(before) || isWhitespace(after) || isPunctuation(after));

  let canOpen: boolean;
  let canClose: boolean;
  if (char === "*") {
    canOpen = leftFlanking;
    canClose = rightFlanking;
  } else {
    // Intraword underscores never form emphasis (snake_case_names).
    canOpen = leftFlanking && (!rightFlanking || isPunctuation(before));
    canClose = rightFlanking && (!leftFlanking || isPunctuation(after));
  }

  const slot = state.appendMarker(src.slice(state.pos, end));
  state.pos = end;
  if (!canOpen && !canClose) return; // plain text
  state.delims.push({ slot, char, length: run, origLength: run, canOpen, canClose, dead: false });
}

function oddMatch(opener: Delimiter, closer: Delimiter): boolean {
  if (!(opener.canClose || closer.canOpen)) return false;
  if ((opener.origLength + closer.origLength) % 3 !== 0) return false;
  return !(opener.origLength % 3 === 0 && closer.origLength % 3 === 0);
}

/**
 * Matches openers and closers in state.delims[bottom..] and wraps the nodes
 * between them in emphasis/strong. Afterwards every delimiter at or above
 * `bottom` is removed from the stack.
 */
export function processEmphasis(state: InlineState, bottom: number): void {
  const delims = state.delims;

  for (let ci = bottom; ci < delims.length; ci++) {
    const closer = delims[ci];
    if (closer.dead || !closer.canClose) continue;

    while (closer.length > 0) {
      let found = -1;
      for (let oi = ci - 1; oi >= bottom; oi--) {
        const o = delims[oi];
        if (o.dead || o.char !== closer.char || !o.canOpen || o.length === 0) continue;
        if (oddMatch(o, closer)) continue;
        found = oi;
        break;
      }

      if (found === -1) break;

      const opener = delims[found];
      const use = opener.length >= 2 && closer.length >= 2 ? 2 : 1;
      opener.length -= use;
      closer.length -= use;
      opener.slot.node.value = opener.slot.node.value.slice(0, opener.length);
      closer.slot.node.value = closer.slot.node.value.slice(use);

      const children: InlineNode[] = [];
      for (let s = opener.slot.next; s && s !== closer.slot; s = s.next) children.push(s.node);
      const wrapper: Emphasis | Strong = use === 2 ? { type: "strong", children } : { type: "emphasis", children };
      const ws: Slot = { node: wrapper, prev: opener.slot, next: closer.slot };
      opener.slot.next = ws;
      closer.slot.prev = ws;

      // Delimiters strictly between opener and closer can no longer match.
      for (let k = found + 1; k < ci; k++) delims[k].dead = true;

      if (opener.length === 0) {
        opener.dead = true;
        state.unlink(opener.slot);
      }
    }

    if (closer.length === 0) {
      closer.dead = true;
      state.unlink(closer.slot);
    }
  }

  delims.length = bottom;
}
