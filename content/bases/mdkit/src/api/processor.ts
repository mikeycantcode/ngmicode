// High-level, batteries-included API used by the docs site and the CLI:
// front matter + parse + plugins + HTML/text/TOC in one call.

import { toText } from "../core/ast";
import type { Root } from "../core/ast";
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

export interface Processor {
  readonly md: Mdkit;
  process(src: string): ProcessResult;
}

export function createProcessor(opts: ProcessorOptions = {}): Processor {
  const md = new Mdkit(opts);
  if (opts.anchors !== false) md.use(headingAnchors());
  if (opts.taskLists !== false) md.use(taskLists());
  if (opts.externalLinks) md.use(externalLinks(opts.externalLinks));
  for (const p of opts.plugins ?? []) md.use(p);

  return {
    md,
    process(src: string): ProcessResult {
      const fm =
        opts.frontMatter === false
          ? { data: {}, body: src, lineCount: 0, raw: null }
          : extractFrontMatter(src);

      const env = createEnv();
      env.slugger = new Slugger();
      const ast = md.parse(fm.body, env, fm.lineCount + 1);

      const toc = buildToc(ast, { ...opts.toc, slugger: env.slugger });
      const firstH1 = ast.children.find((n) => n.type === "heading" && n.depth === 1);

      return {
        html: md.renderAst(ast),
        text: renderText(ast),
        toc,
        tocHtml: renderTocHtml(toc),
        frontMatter: fm.data,
        title: fmString(fm.data, "title") ?? (firstH1 ? toText(firstH1).trim() : null),
        ast,
      };
    },
  };
}
