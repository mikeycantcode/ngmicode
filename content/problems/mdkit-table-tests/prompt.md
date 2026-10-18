# Table test suite

During last quarter's parser refactor, the table tests were deleted ("will rewrite").
Nobody rewrote them. Support now has a vague ticket, "tables sometimes render wrong".
There are no repro steps.

## The ask

1. Write `tests/table.test.ts`, a focused suite that pins down our table behavior
   against the rules below. Aim for a test per rule, not a giant snapshot.
2. If a test exposes a bug, fix the code. Don't weaken the test to match the code.
3. At the end, list the bugs you found and which test caught each one.

## Table rules (GFM)

1. A table is a header row followed by a delimiter row. The two rows must have the same
   number of cells. Otherwise it is not a table.
2. Delimiter cells are dashes with optional colons: `---` (no alignment), `:--` (left),
   `--:` (right), `:-:` (center). Any number of dashes. Surrounding spaces are fine.
3. Leading and trailing pipes are optional on every row.
4. Body rows continue until a blank line or the start of another block.
5. A body row with fewer cells than the header is padded with empty cells. Extra cells
   are dropped.
6. `\|` is a literal pipe inside a cell, and it does not split cells. This also applies
   inside code spans: `` `a\|b` `` renders as `<code>a|b</code>`.
7. Cells support inline Markdown.
8. Alignment renders as `style="text-align:left|center|right"` on both `<th>` and `<td>`.
   Unaligned columns get no `style` attribute.
9. Tables can be turned off with the `tables: false` parse option.

## Constraints

- Test through public APIs (`Mdkit#render`, `parseBlocks`), not private helpers.
- Keep fixes minimal. Other block types are out of scope.
