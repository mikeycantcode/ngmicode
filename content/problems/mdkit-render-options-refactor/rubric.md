## Intended approach
Find all usages first (`renderHtml(`, `new HtmlRenderer(`, `renderInlineHtml(`): `core/mdkit.ts`,
`render/toc.ts` (through `renderInlineHtml`), tests and docs. Then:
1. Define `HtmlOptions`. Give `HtmlRenderer` explicit fields resolved with `??` defaults.
2. Make `renderHtml` overloaded: an options object, or legacy positional arguments.
   Detect the legacy form by argument count or a boolean in the second position, **not**
   by "is the second arg an object". The call `renderHtml(ast, undefined, true)` must mean
   `xhtml: true`.
3. Migrate `Mdkit#renderAst` and `renderInlineHtml`. Update the README "Rendering" note.
4. Add tests that prove the old and new forms give equal output, and that omitted options
   keep their defaults.

## Key files
- `src/render/html.ts` (`HtmlRenderer`, `renderHtml`, `renderInlineHtml`)
- `src/core/mdkit.ts` (`renderAst`)
- `src/render/toc.ts` (`renderTocHtml` → `renderInlineHtml`)
- `src/plugins/pluginHost.ts`, `src/plugins/headingAnchors.ts` (override signature uses the renderer instance)
- `README.md` (Rendering section)

## Traps
- **Default-off sanitizing.** `if (options.sanitize)`, or destructuring without a
  default, makes `renderHtml(ast, {})` and `renderHtml(ast)` emit `javascript:` links.
  That is a silent security regression from a "pure refactor". Hidden test 1 catches it.
- **`||` defaults.** `options.sanitize || true` makes an explicit `sanitize: false` impossible.
- **Legacy detection.** `typeof args[1] === "object"` misreads `renderHtml(ast, undefined, true)`.
  Hidden test 2 catches this.
- **Missed call sites.** `renderInlineHtml(nodes, sanitize)` in the TOC path is easy to miss,
  and the positional constructor call in `renderInlineHtml` breaks once the constructor changes.
- **Breaking the override contract**, by renaming `inlines()`/`blocks()` or making them
  private while restructuring.

## Strong signals
- Inventories call sites before editing, and has the agent work file by file.
- Writes characterization tests (old form vs new form on the same AST) *before* refactoring.
- States the default semantics explicitly (`??`, sanitize on) in the agent prompt.
- Keeps the diff tight, and marks the legacy overload `@deprecated`.

## Weak signals
- Accepts a large diff that also "improves" rendering.
- Removes the positional form, or changes the constructor in a way that breaks overrides.
- Doesn't test omitted-option defaults.

## Follow-up questions
- How would you eventually remove the deprecated overload (telemetry, major version, codemod)?
- Why is "refactor changed a security default" such a common failure, and how do you guard against it in review?
- Should `HtmlRenderer` options be frozen or validated at construction time? What would you do with unknown keys?
- How would you design the options so adding the next option does not require touching every call site?
