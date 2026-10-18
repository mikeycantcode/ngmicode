// Moves footnote definitions out of the body into a single section at the
// end, ordered by first reference. Unreferenced definitions are dropped.

import type { BlockNode, FootnoteItem, Root } from "./ast";
import type { Env } from "./options";

function stripDefinitions(nodes: BlockNode[]): BlockNode[] {
  const out: BlockNode[] = [];
  for (const n of nodes) {
    if (n.type === "footnoteDefinition") continue;
    if (n.type === "blockquote" || n.type === "listItem") n.children = stripDefinitions(n.children);
    if (n.type === "list") n.children.forEach((item) => (item.children = stripDefinitions(item.children)));
    out.push(n);
  }
  return out;
}

export function collectFootnotes(root: Root, env: Env): void {
  root.children = stripDefinitions(root.children);
  const st = env.footnotes;
  if (!st || !st.order.length) return;
  const items: FootnoteItem[] = st.order.map((label, i) => ({
    type: "footnoteItem",
    index: i + 1,
    label,
    refCount: st.refCounts.get(label) ?? 1,
    children: st.defs.get(label)!.children,
  }));
  root.children.push({ type: "footnotes", children: items });
}
