# mdkit

A small, dependency-free Markdown → HTML toolkit in the spirit of markdown-it.
It powers the docs site, the in-app comment renderer and the `mdkit` CLI.

```ts
import { createProcessor } from "./src";

const { html, text, toc, frontMatter, title } = createProcessor().process(source);
```

## Layout

```
src/
  core/
    ast.ts            AST node types, walk(), findAll(), toText()
    options.ts        ParseOptions, Env (per-document state), label normalization
    mdkit.ts          Mdkit class: options + plugins + parse/render pipeline
    errors.ts         MdkitError and friends (FrontMatterError, PluginError, UsageError)
  block/
    blockParser.ts    rule loop; container blocks recurse via ctx.parseBlocks
    lineReader.ts     cursor over a container's lines
    patterns.ts       line-start regexes + canInterruptParagraph()
    rules/            fence, leaf (ATX heading, hr), blockquote, list, table, htmlBlock,
                      paragraph (also setext headings + link reference definitions)
  inline/
    inlineParser.ts   dispatch loop over special characters
    state.ts          InlineState: linked list of output slots, delimiter + bracket stacks
    emphasis.ts       delimiter runs + CommonMark "process emphasis"
    links.ts          links, images, reference links
    rules.ts          escapes, code spans, autolinks, inline HTML, entities, line breaks
  render/
    html.ts           HtmlRenderer / renderHtml()
    text.ts           plain-text renderer (strict: unknown node types throw)
    toc.ts            buildToc(), renderTocHtml(), renderTocMarkdown()
    slugger.ts        slugify() + Slugger (per-document de-duplication)
  plugins/
    pluginHost.ts     Plugin / PluginHooks and the hook runner
    headingAnchors.ts ids on headings (+ optional permalinks)
    taskLists.ts      "- [ ] todo" items
    externalLinks.ts  rel/target on links to other hosts
  frontmatter/
    frontmatter.ts    extractFrontMatter()
    yamlLite.ts       the YAML subset we accept
  util/               escape.ts, entities.ts, url.ts (encodeUrl, isSafeUrl), strings.ts
  api/
    processor.ts      createProcessor(): front matter + parse + html/text/toc in one call
    cli.ts, args.ts   the `mdkit` command (I/O injected)
  index.ts            public exports
```

## Pipeline

```
source ─► extractFrontMatter ─► plugins.preprocess ─► parseBlocks ─► plugins.afterBlocks
       ─► parseInlines ─► plugins.afterInlines ─► AST ─► renderHtml / renderText / buildToc
```

1. **Block parsing** works line by line. Container blocks (blockquotes, list items)
   collect their lines, strip their markers/indentation and call `ctx.parseBlocks`
   recursively, so each rule only ever sees plain lines. Headings, paragraphs and table
   cells keep their unparsed inline source in `raw`.
2. **Inline parsing** fills in `children` from `raw`. Output goes into a doubly linked
   list of slots; emphasis and links wrap ranges of slots in place. Emphasis follows the
   CommonMark delimiter algorithm (flanking rules, rule of 3, `openersBottom`).
3. **Plugins** see the AST after each phase and may install per-node-type render
   overrides (newest plugin first; return `undefined` to fall through).
4. **Renderers** walk the finished AST.

## Conventions

- **The AST is the contract.** Plugins transform the AST, not HTML strings.
- **Env is per document.** Link references, the shared `Slugger`, and any plugin state
  live on `env`. Never reuse an env across documents.
- **One slugger per document.** `headingAnchors` and `buildToc` must share
  `env.slugger`, or duplicate headings get mismatched ids.
- **Safe by default.** Raw HTML is off (`html: false`) and URLs pass through
  `isSafeUrl` when `sanitize` is on (default). Link destinations are fully decoded
  (backslash escapes + entities) at parse time, so the renderer checks exactly what the
  browser will see. All attribute values go through `escapeAttr`.
- **Text renderer is strict.** It throws on node types it does not know. If you add a
  node type, teach `render/text.ts` about it.
- **Errors** thrown on purpose are `MdkitError` subclasses with a `code`. The CLI maps
  `UsageError` to exit code 2 and other `MdkitError`s to exit code 1.
- **No indented code blocks.** Use fences. (A deliberate deviation from CommonMark.)

## Rendering

`renderHtml(root, sanitize, xhtml, breaks, langPrefix, overrides)` still takes
positional arguments for historical reasons (0.x API). Most callers should go through
`Mdkit#renderAst` or `createProcessor`, which pass the instance options along.

## Known gaps

- Entity table is partial (`util/entities.ts`).
- HTML blocks use a simplified start/end rule (start tag ... blank line).
- Slugs are ASCII-only and collapse repeated dashes; not GitHub-compatible.
- No footnotes, no definition lists, no math.

## Tests

`tests/*.test.ts` — block, inline, render, toc, front matter, plugins, and api/CLI.
