## Intended approach
The candidate maps the pipeline first (README "Pipeline"): block rules → inline parser →
plugins → renderers. Then they decompose:
1. Add a `footnotes` flag to `ParseOptions` and `DEFAULT_PARSE_OPTIONS`.
2. Add a block rule for definitions, registered **before** `paragraph`. The paragraph rule
   would otherwise consume `[^a]: …` as a *link reference definition*. Store the
   definitions on the per-document `env`.
3. In the inline parser, add a `[^label]` rule that only fires when a definition exists.
   It assigns the number on first reference and counts repeat references.
4. After inline parsing, move the referenced definitions into a `footnotes` section node
   at the end of the root, ordered by number.
5. Teach **both** renderers the new node types: `html.ts` and the strict `text.ts`.
The reference solution adds `rules/footnote.ts`, `inline/footnoteRef.ts` and
`core/footnotes.ts`, and touches `ast.ts`, `options.ts`, `mdkit.ts`, `blockParser.ts`,
`inlineParser.ts`, `html.ts` and `text.ts`.

## Key files
- `src/block/blockParser.ts` (rule order), `src/block/rules/paragraph.ts` (`extractReferences`)
- `src/inline/inlineParser.ts`, `src/inline/links.ts`
- `src/core/options.ts` (`Env`, `ParseOptions`), `src/core/mdkit.ts` (pipeline)
- `src/render/html.ts`, `src/render/text.ts` (strict: throws on unknown nodes)
- `src/api/processor.ts` (always computes `text`)

## Traps
- **Reference-definition collision.** Without a block rule ahead of `paragraph`,
  `[^a]: text` becomes a link reference definition. Then `[^a]` renders as a *link* to
  `text`. An afterInlines-only plugin never sees the definition.
- **Strict text renderer.** `createProcessor().process()` always renders text. New node
  types without `text.ts` support make **every** footnoted document throw `E_RENDER`.
  Hidden test 3 catches this.
- **Numbering state on the plugin closure or module scope** instead of `env`. The second
  document then starts at 3. Hidden test 3 processes two documents.
- **Definition order vs reference order.** Numbering by definition order fails hidden test 1.
- **Repeat references** need distinct ids and one backref each (hidden test 2).
- **Default off.** `[^1]` must still behave as before without the option (hidden test 4).

## Strong signals
- Reads the pipeline and the conventions in the README before prompting. Gives the agent
  a written plan with the rule-order constraint and the `env` convention.
- Spots that `[^x]: y` already parses as a reference definition, by trying it.
- Has the agent add visible tests for HTML, text and multi-document numbering.
- Verifies the exact HTML against the brief, including the backref placement.

## Weak signals
- One mega-prompt ("add footnotes like GitHub") with no decomposition, then repeated patching.
- Implements footnotes with regexes over the final HTML or the raw source.
- Never runs `process().text`, so it misses the strict-renderer crash.

## Follow-up questions
- Why must the definition rule run before the paragraph rule? What would a plugin-only design need from the core to work?
- How would you support multi-paragraph footnotes (indented continuation)?
- Where should footnote ids come from if two documents are rendered onto one page?
- How would you expose block/inline rule registration to plugins so the next feature doesn't need core changes?
