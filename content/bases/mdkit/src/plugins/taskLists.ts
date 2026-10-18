// GFM task lists: "- [ ] todo" / "- [x] done".

import { findAll } from "../core/ast";
import type { Plugin } from "./pluginHost";

const TASK = /^\[([ xX])\][ \t]+/;

export function taskLists(): Plugin {
  return {
    name: "taskLists",
    hooks: {
      afterInlines(root) {
        for (const item of findAll(root, "listItem")) {
          const first = item.children[0];
          if (!first || first.type !== "paragraph") continue;
          const lead = first.children[0];
          if (!lead || lead.type !== "text") continue;
          const m = TASK.exec(lead.value);
          if (!m) continue;
          item.checked = m[1] !== " ";
          lead.value = lead.value.slice(m[0].length);
        }
      },
    },
  };
}
