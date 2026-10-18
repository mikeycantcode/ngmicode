# Footnotes

The docs team wants footnotes, GitHub-style:

```md
Rendering is fast[^perf] and safe[^xss].

[^perf]: Linear time on all inputs
we know of.
[^xss]: See the *security* guide.
```

## The ask

Add footnote support behind a new option, `footnotes: true`. Any options object that
reaches `Mdkit` accepts it, including `createProcessor`. The default is `false`, and
then nothing changes.

**Syntax**

- A **definition** is a line starting with `[^label]:` (up to 3 leading spaces). Its
  content is the rest of that line plus the following non-blank lines, up to a blank line
  or the next definition. The content is normal Markdown (emphasis, links, …).
- A **reference** is `[^label]` anywhere in inline text.
- Labels contain no whitespace and no `]`. They match case-insensitively. If a label is
  defined twice, the first definition wins.
- A reference with no matching definition stays as literal text (`[^nope]`).

**Numbering and placement**

- Notes are numbered 1, 2, 3… in order of their **first reference**, not their
  definition order.
- Definitions are removed from where they appear. Referenced notes render in one section
  at the very end of the document. Unreferenced definitions are not rendered.
- Numbering starts at 1 for every document, even when one processor handles many.

**HTML**

Reference (the second, third… reference to the same note uses `id="fnref-1-2"`,
`id="fnref-1-3"`, …):

```html
<sup class="footnote-ref"><a href="#fn-1" id="fnref-1">1</a></sup>
```

Section, with one `↩` backref per reference, separated by a space and placed inside the
note's last paragraph:

```html
<section class="footnotes">
<ol>
<li id="fn-1">
<p>Linear time on all inputs
we know of. <a href="#fnref-1" class="footnote-backref">↩</a></p>
</li>
</ol>
</section>
```

**Plain text** (`ProcessResult.text`)

- A reference renders as `[1]`.
- The notes come after the body, one per line: `[1] Linear time on all inputs we know of.`

## Non-goals

Multi-paragraph notes, references inside notes, and footnotes in the TOC.
