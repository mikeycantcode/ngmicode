import { normalizeLabel } from "../core/options";
import type { InlineState } from "./state";

const REF = /\[\^([^\]\s]+)\]/y;

/** `[^label]` with a matching definition. Returns false to fall back to a normal bracket. */
export function footnoteRef(state: InlineState): boolean {
  REF.lastIndex = state.pos;
  const m = REF.exec(state.src);
  if (!m) return false;
  const st = state.env.footnotes;
  const label = normalizeLabel(m[1]);
  if (!st || !st.defs.has(label)) return false;

  let index = st.order.indexOf(label);
  if (index === -1) {
    st.order.push(label);
    index = st.order.length - 1;
  }
  const ref = (st.refCounts.get(label) ?? 0) + 1;
  st.refCounts.set(label, ref);

  state.flush();
  state.append({ type: "footnoteRef", label, index: index + 1, ref });
  state.pos += m[0].length;
  return true;
}
