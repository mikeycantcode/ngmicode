// Public entry point.

export * from "./core/ast";
export { MdkitError, FrontMatterError, PluginError, UsageError } from "./core/errors";
export { createEnv, DEFAULT_PARSE_OPTIONS } from "./core/options";
export type { Env, ParseOptions, LinkReference } from "./core/options";
export { Mdkit } from "./core/mdkit";
export type { MdkitOptions, RenderOptions } from "./core/mdkit";

export { parseBlocks } from "./block/blockParser";
export { parseInline, parseInlines } from "./inline/inlineParser";

export { HtmlRenderer, renderHtml } from "./render/html";
export type { RenderOverride, RenderOverrides } from "./render/html";
export { renderText } from "./render/text";
export { buildToc, renderTocHtml, renderTocMarkdown } from "./render/toc";
export type { TocEntry, TocOptions } from "./render/toc";
export { Slugger, slugify } from "./render/slugger";

export { PluginHost } from "./plugins/pluginHost";
export type { Plugin, PluginHooks } from "./plugins/pluginHost";
export { headingAnchors } from "./plugins/headingAnchors";
export { taskLists } from "./plugins/taskLists";
export { externalLinks } from "./plugins/externalLinks";

export { extractFrontMatter } from "./frontmatter/frontmatter";
export { parseYamlLite } from "./frontmatter/yamlLite";

export { createProcessor } from "./api/processor";
export type { Processor, ProcessorOptions, ProcessResult } from "./api/processor";
export { runCli } from "./api/cli";
export type { CliIO } from "./api/cli";

/** One-shot convenience: Markdown in, safe HTML out. */
import { Mdkit } from "./core/mdkit";
export function markdownToHtml(src: string): string {
  return new Mdkit().render(src);
}
