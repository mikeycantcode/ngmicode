# Numbered steps restart at 1

**Bug report (docs team, P1):**

> Since we upgraded mdkit last week, every install guide shows broken numbering.
> We write steps with a blank line between them so they're readable in the editor:
>
> ```md
> 1. Install the CLI
>
> 2. Configure your token
>
> 3. Run `mdkit render`
> ```
>
> In the browser this now shows as "1. 1. 1.", and the spacing between steps is gone.
> Bullet lists with blank lines look cramped too.

The last release included a fix for issue #212. Before that fix, a list followed by a
blank line and then a normal paragraph swallowed the paragraph into the last list item.
The test suite is green.

## The ask

- Reproduce, find the root cause, and fix it.
- Blank-separated items of the same list must form **one** list. A list with a blank
  line between any two of its items is *loose*: its items render with `<p>` wrappers
  (CommonMark semantics).
- Issue #212 must stay fixed. A blank line followed by an unindented paragraph, or by a
  list with a different marker (`-` vs `*`, `.` vs `)`), still ends the list.
- Make sure the test suite describes the correct behavior.

Be ready to explain why the tests were green while the docs were broken.
