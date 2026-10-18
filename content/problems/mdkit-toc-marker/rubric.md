## Intended approach
Orient across front matter → processor → TOC → renderers → CLI. Then build it at the
**AST level** in `createProcessor().process`:
1. Compute the effective depth: CLI override > front matter `toc_depth` (validated) >
   `opts.toc.maxDepth` > 3. The CLI needs a channel that beats front matter. A processor
   *option* loses to front matter, so the reference solution adds
   `process(src, { tocDepth })`.
2. Build the TOC once, after parsing, with the document's shared `env.slugger`, so its ids
   are the anchor ids.
3. Walk the AST and replace paragraphs consisting of exactly one text node `[[toc]]`
   with an `html` block containing the nav. Remove them when `toc: false`. The HTML renderer
   emits `html` blocks verbatim, and the text renderer already returns `""` for them, so no
   new node type is needed.
4. Add `--toc-depth` to the CLI spec with 1–6 validation (`UsageError`, exit 2), and pass it through.

## Key files
- `src/api/processor.ts` (depth resolution, marker replacement, `toc`/`tocHtml`)
- `src/api/cli.ts`, `src/api/args.ts` (flag spec, exit codes)
- `src/frontmatter/*` (`FmData` types; numbers already come back as numbers)
- `src/render/toc.ts`, `src/plugins/headingAnchors.ts` (shared slugger, `heading.id`)
- `src/render/text.ts` (strict about unknown node types)

## Traps
- **String replacement on HTML output.** `html.replace("<p>[[toc]]</p>", nav)` looks
  fine, but `toc: false` then leaves odd output, and text output still contains the marker.
- **Inline code / longer paragraphs.** Matching on `toText(paragraph)` also catches
  `` `[[toc]]` `` (inline code has the same text). Hidden test 2 checks this.
- **New AST node type** without updating the strict text renderer makes `process()`
  throw for every marker document. Hidden test 3 runs `--format text`.
- **Precedence plumbing.** Passing the CLI flag as `createProcessor({ toc: { maxDepth } })`
  makes front matter win over the flag. Hidden test 3 catches this.
- **Fresh slugger for the nav.** Calling `buildToc` without `env.slugger` (or before
  anchors run) gives correct ids here only by luck. It breaks when anchors are depth-limited.
- **Inconsistent `toc`.** Limiting the nav but not `ProcessResult.toc` (hidden test 1).
- **Validation.** `toc_depth: deep` must be a runtime error (exit 1), and `--toc-depth 9` a usage error (exit 2).

## Strong signals
- Writes the precedence table into the agent prompt, and asks for a channel that beats front matter.
- Chooses an AST-level replacement, and explains why it avoids touching the text renderer.
- Gives the agent a staged plan (processor, then CLI, then tests). Runs the CLI with
  `--format text` and the code-fence case.
- Adds visible tests for precedence and for markers in code.

## Weak signals
- Lets the agent regex-replace the HTML string.
- Only tests the happy path through `createProcessor`. Never runs the CLI.
- Ignores the validation and exit-code requirements.

## Follow-up questions
- Why does the CLI flag need a different channel from the processor option? How else could you model precedence?
- What happens with two `[[toc]]` markers, or a marker inside a blockquote? Is that what writers expect?
- If the TOC had to exclude the page's own h1, where would that rule live?
- How would you make `toc_depth` errors point at the right line in the original file?
