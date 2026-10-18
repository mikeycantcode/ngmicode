// The Mdkit instance: options + plugins + the parse/render pipeline.

import { parseBlocks } from "../block/blockParser";
import { parseInlines } from "../inline/inlineParser";
import type { Plugin } from "../plugins/pluginHost";
import { PluginHost } from "../plugins/pluginHost";
import { renderHtml } from "../render/html";
import { renderText, type TextOptions } from "../render/text";
import type { Root } from "./ast";
import { createEnv, type Env, type ParseOptions, resolveParseOptions } from "./options";
import { normalizeNewlines } from "../util/strings";

export interface RenderOptions {
  /** Drop javascript:/vbscript:/data: URLs from links and images. Default true. */
  sanitize: boolean;
  /** Self-close void elements (`<br />`). Default false. */
  xhtml: boolean;
  /** Render soft line breaks as <br>. Default false. */
  breaks: boolean;
  /** Class prefix for fenced code languages. Default "language-". */
  langPrefix: string;
}

export type MdkitOptions = ParseOptions & RenderOptions;

const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  sanitize: true,
  xhtml: false,
  breaks: false,
  langPrefix: "language-",
};

export class Mdkit {
  readonly options: MdkitOptions;
  readonly plugins = new PluginHost();

  constructor(options: Partial<MdkitOptions> = {}) {
    const render = { ...DEFAULT_RENDER_OPTIONS };
    for (const k of Object.keys(DEFAULT_RENDER_OPTIONS) as (keyof RenderOptions)[]) {
      if (options[k] !== undefined) (render as Record<string, unknown>)[k] = options[k];
    }
    this.options = { ...resolveParseOptions(options), ...render };
  }

  use(plugin: Plugin): this {
    this.plugins.add(plugin);
    return this;
  }

  /**
   * Parses Markdown into a complete AST.
   * @param firstLine line number of `src`'s first line in the original file.
   */
  parse(src: string, env: Env = createEnv(), firstLine = 1): Root {
    const pre = this.plugins.preprocess(normalizeNewlines(src), env);
    const root = parseBlocks(pre, this.options, env, firstLine);
    this.plugins.afterBlocks(root, env);
    parseInlines(root, this.options, env);
    this.plugins.afterInlines(root, env);
    return root;
  }

  renderAst(root: Root): string {
    const { sanitize, xhtml, breaks, langPrefix } = this.options;
    return renderHtml(root, { sanitize, xhtml, breaks, langPrefix, overrides: this.plugins.renderOverrides() });
  }

  render(src: string, env: Env = createEnv()): string {
    return this.renderAst(this.parse(src, env));
  }

  renderText(src: string, opts: TextOptions = {}): string {
    return renderText(this.parse(src), opts);
  }
}
