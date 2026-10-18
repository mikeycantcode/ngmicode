// Plain-text renderer, used for search indexing, email bodies and excerpts.
// Deliberately strict: an unknown node type is a bug (usually a plugin that
// added nodes without teaching this renderer about them), so we throw.

import type { BlockNode, InlineNode, Root } from "../core/ast";
import { MdkitError } from "../core/errors";

export interface TextOptions {
  /** Append " (url)" after link text. Default false. */
  linkUrls?: boolean;
}

function indent(s: string, prefix: string): string {
  return s
    .split("\n")
    .map((l) => (l ? prefix + l : l))
    .join("\n");
}

function inlineText(nodes: InlineNode[], opts: TextOptions): string {
  let out = "";
  for (const n of nodes) {
    switch (n.type) {
      case "text":
      case "inlineCode":
        out += n.value;
        break;
      case "emphasis":
      case "strong":
        out += inlineText(n.children, opts);
        break;
      case "link": {
        const t = inlineText(n.children, opts);
        out += opts.linkUrls && !n.autolink ? `${t} (${n.href})` : t;
        break;
      }
      case "image":
        out += n.alt;
        break;
      case "break":
        out += "\n";
        break;
      case "softbreak":
        out += " ";
        break;
      case "htmlInline":
        break;
      default:
        throw new MdkitError("E_RENDER", `renderText: unknown inline node type "${(n as InlineNode).type}"`);
    }
  }
  return out;
}

function blockText(node: BlockNode, opts: TextOptions): string {
  switch (node.type) {
    case "heading":
    case "paragraph":
      return inlineText(node.children, opts);
    case "blockquote":
      return indent(blocksText(node.children, opts), "> ");
    case "list":
      return node.children
        .map((item, i) => {
          const marker = node.ordered ? `${i + 1}. ` : "- ";
          const box = item.checked === null ? "" : item.checked ? "[x] " : "[ ] ";
          const body = item.children
            .map((c) => blockText(c, opts))
            .filter((t) => t !== "")
            .join(node.tight ? "\n" : "\n\n");
          const pad = " ".repeat(marker.length);
          return marker + box + indent(body, pad).slice(pad.length);
        })
        .join("\n");
    case "code":
      return node.value.replace(/\n$/, "");
    case "thematicBreak":
      return "---";
    case "table":
      return node.children.map((row) => row.children.map((c) => inlineText(c.children, opts)).join(" | ")).join("\n");
    case "html":
      return "";
    default:
      throw new MdkitError("E_RENDER", `renderText: unknown block node type "${node.type}"`);
  }
}

function blocksText(nodes: BlockNode[], opts: TextOptions): string {
  return nodes
    .map((n) => blockText(n, opts))
    .filter((s) => s !== "")
    .join("\n\n");
}

export function renderText(root: Root, opts: TextOptions = {}): string {
  const out = blocksText(root.children, opts);
  return out ? out + "\n" : "";
}
