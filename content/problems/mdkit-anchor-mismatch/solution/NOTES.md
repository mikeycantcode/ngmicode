How a heading gets its id and how the TOC links to it:

1. Block parser stores the heading's inline source in `heading.raw` (e.g. `Install via [npm](https://npmjs.com)`).
2. Inline parser turns `raw` into `children` (text, link, code...).
3. `headingAnchors` plugin (afterInlines) sets `heading.id = env.slugger.slug(toText(heading))`,
   i.e. it slugs the *rendered text* ("Install via npm") with the per-document slugger.
4. HtmlRenderer prints `<h2 id="...">` from `heading.id`.
5. `createProcessor` calls `buildToc(ast, { slugger: env.slugger })`.

Bug: `buildToc` ignored both `heading.id` and `opts.slugger` and re-slugged `heading.raw` with a
fresh Slugger, so headings whose source differs from their text (links, entities, images)
got different ids. Fix: use `heading.id` when present, else slug `toText(heading)` with
the shared slugger.
