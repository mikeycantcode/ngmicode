# Honor ordered-list start numbers

Writers number their steps like this:

```md
3. Configure the server
4. Restart
```

The block parser already stores the number on the list node (`List.start`, see
`src/core/ast.ts`). But both renderers ignore it. The HTML shows "1. 2." and the
plain-text export (used in emails) does too.

Your agent is in **literal mode**: it does exactly what you say and infers nothing.
Your job is to delegate this so precisely that the agent cannot get it wrong.

## Required behavior

**HTML** (`src/render/html.ts`)

- An ordered list whose `start` is not `1` renders as `<ol start="N">`, where N is the
  decimal number. `0` is a valid start and must render `start="0"`.
- An ordered list starting at `1` renders as `<ol>` with no attribute.
- Bullet lists never get a `start` attribute.
- Use the renderer's existing attribute helper so escaping stays consistent.
- Everything else about list output is byte-for-byte unchanged: tight/loose handling,
  newlines, nested lists, task-list checkboxes.

**Plain text** (`src/render/text.ts`)

- Ordered items are numbered `start`, `start+1`, … instead of `1`, `2`, …
- Continuation and nested lines stay aligned under the item text. For example, a nested
  item under `10. ten` is indented 4 spaces. That already works, and it must keep working
  for multi-digit numbers.

## Constraints

- Don't touch the parser. `007)` already parses to `start: 7`.
- Don't change any other node's rendering, and don't refactor the renderers.
- All visible tests must keep passing.
