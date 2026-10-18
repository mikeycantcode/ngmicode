# TOC links jump nowhere

**Support ticket:**

> On a few docs pages, clicking an entry in the table of contents doesn't scroll
> anywhere. For example, "Install via npm" on the Getting Started page. Most entries work.
> The page source is roughly:
>
> ```md
> # Guide
>
> ## Install via [npm](https://npmjs.com)
> ```

Pages are rendered with `createProcessor().process(src)`, using `html` and `tocHtml`.

## The ask

1. Before changing code, write `NOTES.md` (10 lines or fewer). It explains how a heading's
   `id` attribute is produced, end to end, and where the TOC's link targets come from.
   Name the files and functions involved.
2. Fix the bug so that every TOC link targets an `id` that exists on the rendered
   heading. This includes duplicates and headings with inline formatting, links, images
   or entities.
3. Don't change the ids that headings render with today. Customers deep-link to them.

Your agent is a smaller model with limited context. Plan how to feed it the right files.
