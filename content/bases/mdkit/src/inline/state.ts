// Mutable state for parsing one inline run (a paragraph, heading or cell).
//
// Output nodes live in a doubly linked list of slots so that emphasis and
// link processing can wrap a range of already-emitted nodes in O(1) without
// re-indexing arrays.

import type { InlineNode, Text } from "../core/ast";
import type { Env, ParseOptions } from "../core/options";

export interface Slot {
  node: InlineNode;
  prev: Slot | null;
  next: Slot | null;
}

export interface Delimiter {
  slot: Slot & { node: Text };
  char: "*" | "_";
  /** Characters of the run not yet consumed by emphasis. */
  length: number;
  /** Length of the original run (rule of 3). */
  origLength: number;
  canOpen: boolean;
  canClose: boolean;
  /** Set once the delimiter can no longer participate (matched away / removed). */
  dead: boolean;
}

export interface Bracket {
  slot: Slot & { node: Text };
  image: boolean;
  /** False once a link has been formed around it (no links inside links). */
  active: boolean;
  /** delims.length when the bracket was pushed. */
  delimBottom: number;
  /** Source offset just after the `[`. */
  textStart: number;
}

export class InlineState {
  readonly src: string;
  readonly options: ParseOptions;
  readonly env: Env;
  pos = 0;
  head: Slot | null = null;
  tail: Slot | null = null;
  pending = "";
  readonly delims: Delimiter[] = [];
  readonly brackets: Bracket[] = [];
  /**
   * Code-span bookkeeping: for each backtick run length, the source offset
   * from which we already know there is no closing run of that length. Keeps unmatched
   * backticks linear (the classic CommonMark pathological case).
   */
  readonly backtickMisses = new Map<number, number>();

  constructor(src: string, options: ParseOptions, env: Env) {
    this.src = src;
    this.options = options;
    this.env = env;
  }

  flush(): void {
    if (!this.pending) return;
    const value = this.pending;
    this.pending = "";
    this.append({ type: "text", value });
  }

  append(node: InlineNode): Slot {
    const slot: Slot = { node, prev: this.tail, next: null };
    if (this.tail) this.tail.next = slot;
    else this.head = slot;
    this.tail = slot;
    return slot;
  }

  /** Appends a text node that must stay separate (delimiter runs, brackets). */
  appendMarker(value: string): Slot & { node: Text } {
    this.flush();
    return this.append({ type: "text", value }) as Slot & { node: Text };
  }

  unlink(slot: Slot): void {
    if (slot.prev) slot.prev.next = slot.next;
    else this.head = slot.next;
    if (slot.next) slot.next.prev = slot.prev;
    else this.tail = slot.prev;
    slot.prev = slot.next = null;
  }

  /** Detaches every slot after `slot` and returns their nodes in order. */
  takeAfter(slot: Slot): InlineNode[] {
    const out: InlineNode[] = [];
    for (let s = slot.next; s; s = s.next) out.push(s.node);
    slot.next = null;
    this.tail = slot;
    return out;
  }

  /** Final node list with adjacent text nodes merged and empty ones dropped. */
  toNodes(): InlineNode[] {
    this.flush();
    const out: InlineNode[] = [];
    for (let s = this.head; s; s = s.next) out.push(s.node);
    return mergeText(out);
  }
}

export function mergeText(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const n of nodes) {
    if (n.type === "text") {
      if (!n.value) continue;
      const last = out[out.length - 1];
      if (last && last.type === "text") {
        out[out.length - 1] = { type: "text", value: last.value + n.value };
        continue;
      }
    } else if ((n.type === "emphasis" || n.type === "strong" || n.type === "link") && n.children) {
      n.children = mergeText(n.children);
    }
    out.push(n);
  }
  return out;
}
