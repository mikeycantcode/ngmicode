# Options object for `renderHtml`

`renderHtml` and the `HtmlRenderer` constructor take five positional arguments
(`sanitize, xhtml, breaks, langPrefix, overrides`). Call sites look like
`renderHtml(ast, true, false, true)`, and nobody can tell what they do. Ticket mdkit#57
asks for an options object. We are about to add more render options, so this needs to
happen first.

## The ask

- Introduce an exported `HtmlOptions` interface:
  `{ sanitize?, xhtml?, breaks?, langPrefix?, overrides? }`.
- `renderHtml(root, options?)` and `new HtmlRenderer(options?)` take it.
- Migrate **every** internal caller to the new form.
- The positional form of `renderHtml` must keep working, with identical output. Third-party
  plugins call it, so mark it deprecated rather than removing it. The `HtmlRenderer`
  constructor does not need a positional fallback.
- Output must be byte-for-byte identical for equivalent inputs. Any option the caller
  omits keeps its current default. `sanitize` defaults to **on**.

## Constraints

- This is a refactor, so no behavior changes and no new render options yet.
- Plugins' render overrides (`(node, renderer) => …`) use `renderer.inlines()` and friends.
  They must keep working.
- All visible tests must pass. Add tests for the new API.
