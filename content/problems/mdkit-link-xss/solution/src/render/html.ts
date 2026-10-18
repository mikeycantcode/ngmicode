// HTML renderer.
//
// Output conventions (kept stable; downstream snapshot tests depend on them):
//  - every block element ends with "\n"
//  - tight list items render their paragraphs without <p>
//  - all text and attribute values are escaped; URLs go through isSafeUrl
//    when sanitizing is on (the default)

import type { BlockNode, InlineNode, ListItem, Node, Root, Table } from "../core/ast";
import { escapeAttr, escapeHtml } from "../util/escape";
import { isSafeUrl } from "../util/url";

/**
 * A per-node-type render override (installed by plugins). Return a string to
 * replace the default output, or undefined to fall through to the default.
 */
export type RenderOverride = (node: Node, renderer: HtmlRenderer) => string | undefined;
export type RenderOverrides = Partial<Record<Node["type"], RenderOverride>>;

export class HtmlRenderer {
  constructor(
    readonly sanitize: boolean = true,
    readonly xhtml: boolean = false,
    readonly breaks: boolean = false,
    readonly langPrefix: string = "language-",
    readonly overrides: RenderOverrides = {},
  ) {}

  render(root: Root): string {
    return this.blocks(root.children);
  }

  /** "<br>" or "<br />" etc. depending on the xhtml flag. */
  voidTag(name: string, attrs = ""): string {
    return `<${name}${attrs}${this.xhtml ? " /" : ""}>`;
  }

  attrs(attrs: Record<string, string | null | undefined>): string {
    let out = "";
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined) continue;
      out += ` ${k}="${escapeAttr(v)}"`;
    }
    return out;
  }

  blocks(nodes: BlockNode[]): string {
    let out = "";
    for (const n of nodes) out += this.block(n);
    return out;
  }

  block(node: BlockNode): string {
    const override = this.overrides[node.type];
    if (override) {
      const res = override(node, this);
      if (res !== undefined) return res;
    }
    switch (node.type) {
      case "heading": {
        const tag = `h${node.depth}`;
        return `<${tag}${this.attrs({ id: node.id })}>${this.inlines(node.children)}</${tag}>\n`;
      }
      case "paragraph":
        return `<p>${this.inlines(node.children)}</p>\n`;
      case "blockquote":
        return `<blockquote>\n${this.blocks(node.children)}</blockquote>\n`;
      case "list": {
        const tag = node.ordered ? "ol" : "ul";
        let items = "";
        for (const item of node.children) items += this.listItem(item, node.tight);
        return `<${tag}>\n${items}</${tag}>\n`;
      }
      case "listItem":
        return this.listItem(node, false);
      case "code": {
        const cls = node.lang ? this.langPrefix + node.lang : null;
        return `<pre><code${this.attrs({ class: cls })}>${escapeHtml(node.value)}</code></pre>\n`;
      }
      case "thematicBreak":
        return this.voidTag("hr") + "\n";
      case "table":
        return this.table(node);
      case "html":
        return node.value;
      case "tableRow":
      case "tableCell":
        // Only reachable via table(); rendering them standalone is a caller bug.
        return "";
    }
  }

  listItem(item: ListItem, tight: boolean): string {
    let checkbox = "";
    if (item.checked !== null) {
      checkbox =
        this.voidTag("input", ` type="checkbox" disabled${item.checked ? ` checked` : ""}`) + " ";
    }
    if (!tight) return `<li>\n${checkbox}${this.blocks(item.children)}</li>\n`;

    let body = checkbox;
    const kids = item.children;
    kids.forEach((child, i) => {
      if (child.type === "paragraph") {
        body += this.inlines(child.children);
        if (i < kids.length - 1) body += "\n";
      } else {
        if (i === 0) body += "\n";
        body += this.block(child);
      }
    });
    return `<li>${body}</li>\n`;
  }

  table(node: Table): string {
    const [head, ...body] = node.children;
    const cell = (tag: "th" | "td", i: number, children: InlineNode[]) => {
      const align = node.align[i];
      return `<${tag}${this.attrs({ style: align ? `text-align:${align}` : null })}>${this.inlines(children)}</${tag}>\n`;
    };
    let out = "<table>\n<thead>\n<tr>\n";
    head.children.forEach((c, i) => (out += cell("th", i, c.children)));
    out += "</tr>\n</thead>\n";
    if (body.length) {
      out += "<tbody>\n";
      for (const row of body) {
        out += "<tr>\n";
        row.children.forEach((c, i) => (out += cell("td", i, c.children)));
        out += "</tr>\n";
      }
      out += "</tbody>\n";
    }
    return out + "</table>\n";
  }

  inlines(nodes: InlineNode[]): string {
    let out = "";
    for (const n of nodes) out += this.inline(n);
    return out;
  }

  inline(node: InlineNode): string {
    const override = this.overrides[node.type];
    if (override) {
      const res = override(node, this);
      if (res !== undefined) return res;
    }
    switch (node.type) {
      case "text":
        return escapeHtml(node.value);
      case "emphasis":
        return `<em>${this.inlines(node.children)}</em>`;
      case "strong":
        return `<strong>${this.inlines(node.children)}</strong>`;
      case "inlineCode":
        return `<code>${escapeHtml(node.value)}</code>`;
      case "break":
        return this.voidTag("br") + "\n";
      case "softbreak":
        return this.breaks ? this.voidTag("br") + "\n" : "\n";
      case "htmlInline":
        return node.value;
      case "link": {
        const inner = this.inlines(node.children);
        if (this.sanitize && !isSafeUrl(node.href)) return inner;
        return `<a${this.attrs({ href: node.href, title: node.title, ...node.attrs })}>${inner}</a>`;
      }
      case "image": {
        if (this.sanitize && !isSafeUrl(node.src)) return escapeHtml(node.alt);
        return this.voidTag("img", this.attrs({ src: node.src, alt: node.alt, title: node.title }));
      }
    }
  }
}

/**
 * Renders a parsed document to HTML.
 *
 * The positional signature dates from 0.x; see the README "Rendering" section.
 * TODO: move to an options object (tracked in mdkit#57).
 */
export function renderHtml(
  root: Root,
  sanitize = true,
  xhtml = false,
  breaks = false,
  langPrefix = "language-",
  overrides: RenderOverrides = {},
): string {
  return new HtmlRenderer(sanitize, xhtml, breaks, langPrefix, overrides).render(root);
}

/** Renders a run of inline nodes (used by the TOC renderer). */
export function renderInlineHtml(nodes: InlineNode[], sanitize = true): string {
  return new HtmlRenderer(sanitize).inlines(nodes);
}
