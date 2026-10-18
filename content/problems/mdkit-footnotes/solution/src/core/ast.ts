// The mdkit AST. Loosely modelled on mdast, but flatter: every node carries a
// `type` discriminant, container nodes carry `children`, and block nodes carry
// the 1-based source line they started on (useful for error messages and
// source maps in the editor integration).

export interface Position {
  /** 1-based line in the *original* document (front matter included). */
  line: number;
}

interface BaseNode {
  type: string;
  position?: Position;
}

// ---------------------------------------------------------------------------
// Block nodes
// ---------------------------------------------------------------------------

export interface Root extends BaseNode {
  type: "root";
  children: BlockNode[];
}

export interface Heading extends BaseNode {
  type: "heading";
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  /** Raw inline source, before inline parsing. */
  raw: string;
  children: InlineNode[];
  /** Anchor id; set by the headingAnchors plugin. */
  id?: string;
}

export interface Paragraph extends BaseNode {
  type: "paragraph";
  raw: string;
  children: InlineNode[];
}

export interface Blockquote extends BaseNode {
  type: "blockquote";
  children: BlockNode[];
}

export interface List extends BaseNode {
  type: "list";
  ordered: boolean;
  /** Start number for ordered lists (always 1 for bullet lists). */
  start: number;
  /** Bullet char (`-`, `*`, `+`) or ordered delimiter (`.`, `)`). */
  marker: string;
  /** Tight lists render their paragraphs without <p> wrappers. */
  tight: boolean;
  children: ListItem[];
}

export interface ListItem extends BaseNode {
  type: "listItem";
  /** Task-list state; null for ordinary items. Set by the taskLists plugin. */
  checked: boolean | null;
  children: BlockNode[];
}

export interface CodeBlock extends BaseNode {
  type: "code";
  /** First word of the info string, or null. */
  lang: string | null;
  /** The full info string (trimmed). */
  info: string;
  value: string;
}

export interface ThematicBreak extends BaseNode {
  type: "thematicBreak";
}

export type Align = "left" | "center" | "right" | null;

export interface Table extends BaseNode {
  type: "table";
  align: Align[];
  /** First row is the header row. */
  children: TableRow[];
}

export interface TableRow extends BaseNode {
  type: "tableRow";
  header: boolean;
  children: TableCell[];
}

export interface TableCell extends BaseNode {
  type: "tableCell";
  raw: string;
  children: InlineNode[];
}

export interface HtmlBlock extends BaseNode {
  type: "html";
  value: string;
}

/** `[^label]: text` — removed from the tree after inline parsing (see core/footnotes.ts). */
export interface FootnoteDefinition extends BaseNode {
  type: "footnoteDefinition";
  /** Normalized label. */
  label: string;
  children: BlockNode[];
}

/** The footnote section appended at the end of the document. */
export interface Footnotes extends BaseNode {
  type: "footnotes";
  children: FootnoteItem[];
}

export interface FootnoteItem extends BaseNode {
  type: "footnoteItem";
  /** 1-based number, in order of first reference. */
  index: number;
  label: string;
  /** How many times the note is referenced (one backref each). */
  refCount: number;
  children: BlockNode[];
}

export type BlockNode =
  | Heading
  | Paragraph
  | Blockquote
  | List
  | ListItem
  | CodeBlock
  | ThematicBreak
  | Table
  | TableRow
  | TableCell
  | HtmlBlock
  | FootnoteDefinition
  | Footnotes
  | FootnoteItem;

// ---------------------------------------------------------------------------
// Inline nodes
// ---------------------------------------------------------------------------

export interface Text extends BaseNode {
  type: "text";
  value: string;
}

export interface Emphasis extends BaseNode {
  type: "emphasis";
  children: InlineNode[];
}

export interface Strong extends BaseNode {
  type: "strong";
  children: InlineNode[];
}

export interface InlineCode extends BaseNode {
  type: "inlineCode";
  value: string;
}

export interface Link extends BaseNode {
  type: "link";
  href: string;
  title: string | null;
  /** True for <autolinks>. */
  autolink?: boolean;
  children: InlineNode[];
  /** Extra attributes added by plugins (e.g. rel, target). */
  attrs?: Record<string, string>;
}

export interface Image extends BaseNode {
  type: "image";
  src: string;
  title: string | null;
  alt: string;
}

export interface Break extends BaseNode {
  type: "break";
}

export interface SoftBreak extends BaseNode {
  type: "softbreak";
}

export interface HtmlInline extends BaseNode {
  type: "htmlInline";
  value: string;
}

export interface FootnoteRef extends BaseNode {
  type: "footnoteRef";
  label: string;
  /** Footnote number. */
  index: number;
  /** 1 for the first reference to this note, 2 for the second, ... */
  ref: number;
}

export type InlineNode = FootnoteRef | Text | Emphasis | Strong | InlineCode | Link | Image | Break | SoftBreak | HtmlInline;

export type Node = Root | BlockNode | InlineNode;

export type Parent = Extract<Node, { children: unknown[] }>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isParent(node: Node): node is Parent {
  return Array.isArray((node as { children?: unknown }).children);
}

export type Visitor = (node: Node, parent: Parent | null, index: number) => void | "skip";

/**
 * Depth-first, pre-order walk. Return "skip" from the visitor to avoid
 * descending into a node's children.
 */
export function walk(node: Node, visit: Visitor, parent: Parent | null = null, index = 0): void {
  if (visit(node, parent, index) === "skip") return;
  if (isParent(node)) {
    const kids = node.children as Node[];
    for (let i = 0; i < kids.length; i++) walk(kids[i], visit, node, i);
  }
}

/** Collects every node of the given type, in document order. */
export function findAll<T extends Node["type"]>(root: Node, type: T): Extract<Node, { type: T }>[] {
  const out: Extract<Node, { type: T }>[] = [];
  walk(root, (n) => {
    if (n.type === type) out.push(n as Extract<Node, { type: T }>);
  });
  return out;
}

/**
 * Plain-text content of a node: text, code and image alt text, with soft and
 * hard breaks collapsed to a single space.
 */
export function toText(node: Node): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
      return node.value;
    case "image":
      return node.alt;
    case "break":
    case "softbreak":
      return " ";
    case "htmlInline":
      return "";
    default:
      if (isParent(node)) return (node.children as Node[]).map(toText).join("");
      return "";
  }
}

export function text(value: string): Text {
  return { type: "text", value };
}
