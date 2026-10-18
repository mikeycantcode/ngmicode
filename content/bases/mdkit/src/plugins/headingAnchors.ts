// Gives every heading an `id` so it can be linked to (`#installation`).

import type { Heading } from "../core/ast";
import { findAll, toText } from "../core/ast";
import { escapeAttr } from "../util/escape";
import { Slugger } from "../render/slugger";
import type { Plugin } from "./pluginHost";

export interface HeadingAnchorOptions {
  /** Only headings at or below this depth get ids. Default 1. */
  minDepth?: number;
  /** Only headings at or above this depth get ids. Default 6. */
  maxDepth?: number;
  /** Append a `<a class="anchor">` permalink inside the heading. Default false. */
  permalink?: boolean;
  /** Text of the permalink. Default "#". */
  permalinkSymbol?: string;
}

export function headingAnchors(opts: HeadingAnchorOptions = {}): Plugin {
  const minDepth = opts.minDepth ?? 1;
  const maxDepth = opts.maxDepth ?? 6;
  const symbol = opts.permalinkSymbol ?? "#";
  return {
    name: "headingAnchors",
    hooks: {
      afterInlines(root, env) {
        // Share the document slugger so the TOC hands out the same ids.
        if (!env.slugger) env.slugger = new Slugger();
        for (const h of findAll(root, "heading")) {
          if (h.depth < minDepth || h.depth > maxDepth) continue;
          h.id = env.slugger.slug(toText(h));
        }
      },
      render: opts.permalink
        ? {
            heading(node, r) {
              const h = node as Heading;
              if (!h.id) return undefined;
              const tag = `h${h.depth}`;
              const link = `<a class="anchor" href="#${escapeAttr(h.id)}">${symbol}</a>`;
              return `<${tag} id="${escapeAttr(h.id)}">${r.inlines(h.children)} ${link}</${tag}>\n`;
            },
          }
        : undefined,
    },
  };
}
