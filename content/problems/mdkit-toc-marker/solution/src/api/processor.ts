// High-level, batteries-included API used by the docs site and the CLI:
// front matter + parse + plugins + HTML/text/TOC in one call.

import { toText, walk } from "../core/ast";
import type { HtmlBlock, Root } from "../core/ast";
import { FrontMatterError } from "../core/errors";
import { Mdkit, type MdkitOptions } from "../core/mdkit";
import { createEnv } from "../core/options";
import { extractFrontMatter, fmString } from "../frontmatter/frontmatter";
import type { FmData } from "../frontmatter/yamlLite";
import { externalLinks, type ExternalLinkOptions } from "../plugins/externalLinks";
import { headingAnchors } from "../plugins/headingAnchors";
import type { Plugin } from "../plugins/pluginHost";
import { taskLists } from "../plugins/taskLists";
import { Slugger } from "../render/slugger";
import { renderText } from "../render/text";
import { buildToc, renderTocHtml, type TocEntry } from "../render/toc";

export interface ProcessorOptions extends Partial<MdkitOptions> {
  /** Parse a leading `---` front matter block. Default true. */
  frontMatter?: boolean;
  /** Add ids to headings. Default true. */
  anchors?: boolean;
  /** GFM task list items. Default true. */
  taskLists?: boolean;
  /** Mark external links; false to disable. Default disabled. */
  externalLinks?: ExternalLinkOptions | false;
  /** Heading levels included in the TOC. Default 1..3. */
  toc?: { minDepth?: number; maxDepth?: number };
  /** Extra plugins, applied after the built-in ones. */
  plugins?: Plugin[];
}

export interface ProcessResult {
  html: string;
  text: string;
  toc: TocEntry[];
  tocHtml: string;
  frontMatter: FmData;
  /** front matter `title`, else the text of the first h1, else null. */
  title: string | null;
  ast: Root;
}

/** Per-call overrides (used by the CLI). These win over front matter. */
export interface ProcessOverrides {
  /** Deepest heading level in the TOC and in `[[toc]]` markers. */
  tocDepth?: number;
}

export interface Processor {
  readonly md: Mdkit;
  process(src: string, overrides?: ProcessOverrides): ProcessResult;
}

const TOC_MARKER = "[[toc]]";

export function isValidTocDepth(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 6;
}

function frontMatterTocDepth(data: FmData, raw: string | null): number | undefined {
  const v = data.toc_depth;
  if (v === undefined || v === null) return undefined;
  if (!isValidTocDepth(v)) {
    const idx = (raw ?? "").split("\n").findIndex((l) => /^toc_depth\s*:/.test(l));
    throw new FrontMatterError("toc_depth must be an integer from 1 to 6", idx === -1 ? 1 : idx + 2);
  }
  return v;
}

/** Replaces every paragraph that is exactly `[[toc]]` with `html` (or removes it when html is null). */
function replaceTocMarkers(root: Root, html: string | null): void {
  walk(root, (node) => {
    if (!("children" in node) || node.type === "paragraph" || node.type === "heading") return;
    const kids = node.children as Root["children"];
    for (let i = kids.length - 1; i >= 0; i--) {
      const k = kids[i];
      if (k.type !== "paragraph" || k.children.length !== 1) continue;
      const only = k.children[0];
      if (only.type !== "text" || only.value.trim().toLowerCase() !== TOC_MARKER) continue;
      if (html === null) kids.splice(i, 1);
      else {
        const block: HtmlBlock = { type: "html", value: html, position: k.position };
        kids[i] = block;
      }
    }
  });
}

export function createProcessor(opts: ProcessorOptions = {}): Processor {
  const md = new Mdkit(opts);
  if (opts.anchors !== false) md.use(headingAnchors());
  if (opts.taskLists !== false) md.use(taskLists());
  if (opts.externalLinks) md.use(externalLinks(opts.externalLinks));
  for (const p of opts.plugins ?? []) md.use(p);

  return {
    md,
    process(src: string, overrides: ProcessOverrides = {}): ProcessResult {
      const fm =
        opts.frontMatter === false
          ? { data: {}, body: src, lineCount: 0, raw: null }
          : extractFrontMatter(src);

      const env = createEnv();
      env.slugger = new Slugger();
      const ast = md.parse(fm.body, env, fm.lineCount + 1);

      // Precedence: per-call override > front matter > processor option > default (3).
      const maxDepth = overrides.tocDepth ?? frontMatterTocDepth(fm.data, fm.raw) ?? opts.toc?.maxDepth;
      const toc = buildToc(ast, { ...opts.toc, maxDepth, slugger: env.slugger });
      const tocHtml = renderTocHtml(toc);
      replaceTocMarkers(ast, fm.data.toc === false ? null : `<nav class="toc">\n${tocHtml}</nav>\n`);
      const firstH1 = ast.children.find((n) => n.type === "heading" && n.depth === 1);

      return {
        html: md.renderAst(ast),
        text: renderText(ast),
        toc,
        tocHtml,
        frontMatter: fm.data,
        title: fmString(fm.data, "title") ?? (firstH1 ? toText(firstH1).trim() : null),
        ast,
      };
    },
  };
}
