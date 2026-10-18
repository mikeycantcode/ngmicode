## Intended approach
The candidate traces the path and writes it down: block parser → `heading.raw` → inline
parser → `headingAnchors` plugin (`afterInlines`) sets
`heading.id = env.slugger.slug(toText(heading))` → `HtmlRenderer` prints `id`. Separately,
`createProcessor` calls `buildToc(ast, { slugger: env.slugger })`. In `render/toc.ts`,
`buildToc` ignores both `heading.id` and `opts.slugger`. It creates a fresh `Slugger` and
slugs `heading.raw` (the Markdown source), so `Install via [npm](https://npmjs.com)`
becomes `install-via-npmhttpsnpmjscom`. Fix: `const slugger = opts.slugger ?? new Slugger()`
and `const id = h.id ?? slugger.slug(text)`. With a weak agent, the candidate should hand it
the two or three relevant snippets rather than "look around".

## Key files
- `src/render/toc.ts` (`buildToc`, the misleading comment)
- `src/plugins/headingAnchors.ts` (where real ids come from)
- `src/api/processor.ts` (wiring, shared `env.slugger`)
- `src/render/slugger.ts`, `src/core/ast.ts` (`toText`)

## Traps
- **Fixing the wrong side.** Changing `headingAnchors` to slug `raw` makes the two sides
  agree, but it changes every rendered id. That breaks deep links, which the brief forbids.
  Hidden test 1 asserts `install-via-npm`.
- **Misleading comment.** The comment claims `opts.slugger` is kept "for compatibility"
  and that raw slugging is intentional. A weak agent tends to trust it.
- **Fresh slugger + text only.** Switching to `toText` but keeping `new Slugger()` works
  in this test, but it diverges once anchors are depth-limited. Reusing `heading.id` is
  the robust fix.
- **Weak-agent truncation.** Asking the agent to "find why anchors differ" across the
  codebase tends to stall. Pointing it at `toc.ts` + `headingAnchors.ts` works.

## Strong signals
- NOTES.md is accurate, short and names functions, written before the fix.
- Reproduces with the ticket's exact Markdown and compares `html` vs `tocHtml`.
- Gives the weak agent a narrow, concrete instruction with the snippet to change.
- Adds a regression test asserting that every TOC id appears in the HTML.

## Weak signals
- Skips the explanation, or writes a generic one ("the slugger is wrong").
- Changes `slugify` or the anchors plugin.
- Lets the agent wander through the parser.

## Follow-up questions
- Why does slugging `raw` differ from slugging the rendered text? List three heading shapes where they diverge.
- What breaks if the TOC and anchors use *different* Slugger instances, even with the same input text?
- Should `buildToc` ever compute ids itself, or should it require anchored headings?
- How would you detect broken intra-page links across the whole docs site automatically?
