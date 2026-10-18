// Parser options and the per-document environment object.

import type { Slugger } from "../render/slugger";

export interface ParseOptions {
  /** Allow raw HTML blocks and inline HTML. Off by default (user content!). */
  html: boolean;
  /** Recognise GFM pipe tables. */
  tables: boolean;
  /** Footnotes: `[^1]` references and `[^1]: text` definitions. */
  footnotes: boolean;
  /** Maximum nesting depth for blockquotes/lists before we stop recursing. */
  maxNesting: number;
}

export const DEFAULT_PARSE_OPTIONS: ParseOptions = {
  html: false,
  tables: true,
  footnotes: false,
  maxNesting: 20,
};

export function resolveParseOptions(partial: Partial<ParseOptions> = {}): ParseOptions {
  const out = { ...DEFAULT_PARSE_OPTIONS };
  for (const [k, v] of Object.entries(partial)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export interface LinkReference {
  href: string;
  title: string | null;
}

export interface FootnoteState {
  /** Definitions by normalized label (first definition wins). */
  defs: Map<string, import("./ast").FootnoteDefinition>;
  /** Labels in order of first reference; index + 1 is the footnote number. */
  order: string[];
  refCounts: Map<string, number>;
}

/**
 * Per-document state shared between the parser, plugins and renderers.
 * A fresh Env is created for every document; never reuse one.
 */
export interface Env {
  /** Link reference definitions, keyed by normalized label. */
  references: Map<string, LinkReference>;
  /** Slugger shared by anchors and TOC so duplicate headings stay in sync. */
  slugger?: Slugger;
  /** Footnote bookkeeping (only when options.footnotes is on). */
  footnotes?: FootnoteState;
  /** Free-form bag for plugins. Namespace your keys. */
  [key: string]: unknown;
}

export function footnoteState(env: Env): FootnoteState {
  if (!env.footnotes) env.footnotes = { defs: new Map(), order: [], refCounts: new Map() };
  return env.footnotes;
}

export function createEnv(): Env {
  return { references: new Map() };
}

/** Normalizes a link label for reference lookup (case-fold, collapse ws). */
export function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}
