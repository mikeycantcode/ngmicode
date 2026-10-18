// Table of contents: collects headings into a nested outline.

import type { Heading, Root } from "../core/ast";
import { findAll, toText } from "../core/ast";
import { escapeAttr } from "../util/escape";
import { renderInlineHtml } from "./html";
import { Slugger } from "./slugger";

export interface TocEntry {
  depth: number;
  /** Plain-text heading content. */
  text: string;
  /** Anchor id (matches the rendered heading's id attribute). */
  id: string;
  /** The heading node, for renderers that want inline formatting. */
  heading: Heading;
  children: TocEntry[];
}

export interface TocOptions {
  /** Shallowest heading level to include. Default 1. */
  minDepth?: number;
  /** Deepest heading level to include. Default 3. */
  maxDepth?: number;
  /**
   * Slugger for headings that do not have an id yet. Pass the document's
   * env.slugger so ids agree with the headingAnchors plugin.
   */
  slugger?: Slugger;
}

/**
 * Builds a nested outline. A heading becomes a child of the nearest preceding
 * shallower heading; skipped levels (h1 -> h3) nest directly.
 */
export function buildToc(root: Root, opts: TocOptions = {}): TocEntry[] {
  const minDepth = opts.minDepth ?? 1;
  const maxDepth = opts.maxDepth ?? 3;
  // The TOC uses its own slugger over the heading source so it can be built
  // from any AST, whether or not it has been through the anchors plugin.
  // (opts.slugger is kept for API compatibility.)
  const slugger = new Slugger();

  const top: TocEntry[] = [];
  const stack: TocEntry[] = [];
  for (const h of findAll(root, "heading")) {
    const text = toText(h).trim();
    // Always slug (even if filtered out) so numbering matches the anchors.
    const id = slugger.slug(h.raw);
    if (h.depth < minDepth || h.depth > maxDepth) continue;
    const entry: TocEntry = { depth: h.depth, text, id, heading: h, children: [] };
    while (stack.length && stack[stack.length - 1].depth >= h.depth) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(entry);
    else top.push(entry);
    stack.push(entry);
  }
  return top;
}

/** Renders entries as nested <ul> lists, keeping inline formatting (code, emphasis). */
export function renderTocHtml(entries: TocEntry[]): string {
  if (!entries.length) return "";
  let out = "<ul>\n";
  for (const e of entries) {
    out += `<li><a href="#${escapeAttr(e.id)}">${renderInlineHtml(e.heading.children)}</a>`;
    if (e.children.length) out += "\n" + renderTocHtml(e.children);
    out += "</li>\n";
  }
  return out + "</ul>\n";
}

/** Renders entries as a Markdown bullet list ("- [Text](#id)"), two-space indented. */
export function renderTocMarkdown(entries: TocEntry[], level = 0): string {
  let out = "";
  for (const e of entries) {
    const text = e.text.replace(/([\[\]\\])/g, "\\$1");
    out += `${"  ".repeat(level)}- [${text}](#${e.id})\n`;
    out += renderTocMarkdown(e.children, level + 1);
  }
  return out;
}

/** Strips the `heading` back-reference so entries can be JSON-serialized. */
export function tocToJson(entries: TocEntry[]): Array<Omit<TocEntry, "heading" | "children"> & { children: unknown[] }> {
  return entries.map((e) => ({ depth: e.depth, text: e.text, id: e.id, children: tocToJson(e.children) }));
}
