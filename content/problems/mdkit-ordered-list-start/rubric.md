## Intended approach
Candidate gives the literal agent two surgical edits, naming the file and function for each:
1. `HtmlRenderer.block`, `case "list"`: compute
   `start = node.ordered && node.start !== 1 ? String(node.start) : null` and render
   `<${tag}${this.attrs({ start })}>`. `attrs()` skips null values and escapes.
2. `render/text.ts` `blockText`, `case "list"`: change the marker to `${node.start + i}. `.
They tell the agent explicitly not to touch anything else, and they verify with the visible tests plus a few renders (`0.`, `1.`, `3.`, bullets, nested).

## Key files
- `src/render/html.ts` (`case "list"`)
- `src/render/text.ts` (`case "list"`)
- `src/core/ast.ts` (`List.start`, for context)

## Traps
- **Falsy zero.** `if (node.start)` or `node.start > 1` drops `start="0"`. Hidden test 1 catches this.
- **Bullet lists.** Bullet lists have `start: 1`, so `start !== 1` alone is safe. But an
  agent told "add start when present" emits it for every list.
- **Second code path.** The plain-text renderer also numbers items. A candidate who only
  mentions HTML leaves emails wrong. Hidden test 3 catches this.
- **Over-reach.** Literal mode does what it's told. Vague instructions like "fix list
  numbering everywhere" invite edits to the parser or TOC.
- **Attribute formatting.** Hand-building ` start=${n}` without quotes, or with a stray
  space, breaks exact output. The `attrs()` helper avoids both.

## Strong signals
- Names both files and functions, and gives the exact condition including the `0` case.
- Says "use `this.attrs`" rather than string concatenation.
- States what must not change, and asks the agent to run the visible tests.
- Checks the nested/loose case or multi-digit text alignment.

## Weak signals
- One vague instruction ("support list start numbers") and accepting the first diff.
- Forgets the text renderer until a reviewer points at it.
- Lets the agent modify `list.ts` "to be safe".

## Follow-up questions
- CommonMark says only a list starting with `1` may interrupt a paragraph. Where is that implemented, and why does that rule exist?
- Should `start` be emitted for `1)` lists that use a paren delimiter? Does HTML care?
- How would you support `reversed` ordered lists without changing the AST shape?
- What would break downstream if HTML output changed in ways not covered by tests? How do you protect against that?
