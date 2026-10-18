# Inline `[[toc]]` marker

Writers want to place a table of contents inside the page. Today `ProcessResult.tocHtml`
exists, but every consumer pastes it in by hand. Add a marker:

```md
---
title: Guide
toc_depth: 2
---
# Guide

[[toc]]

## Setup
...
```

## Required behavior

**Marker**

- A paragraph whose entire content is `[[toc]]` (case-insensitive, surrounding
  whitespace allowed) is replaced in the HTML by:
  `<nav class="toc">\n` + the same HTML as `ProcessResult.tocHtml` + `</nav>\n`.
- `[[toc]]` inside code (fenced or inline), or as part of a longer paragraph, is left alone.
- TOC links must point at the ids the headings actually render with, including
  de-duplicated ones (`#setup-1`).
- Plain-text output (`ProcessResult.text`, `--format text`) omits the marker paragraph.

**Depth and switches**

- Front matter `toc_depth: N` sets the deepest heading level included (an integer from 1
  to 6). Anything else is an error: a `FrontMatterError` whose message mentions
  `toc_depth`, which the CLI reports with exit code 1.
- Front matter `toc: false` removes the marker paragraph and renders no nav.
- `mdkit render` gets a `--toc-depth N` flag (1–6, otherwise a usage error, exit code 2).
- Precedence, highest first:
  1. the CLI flag
  2. front matter
  3. `createProcessor({ toc: { maxDepth } })`
  4. the default, 3
- `ProcessResult.toc` and `tocHtml` reflect the same effective depth as the nav.

## Constraints

- Existing `createProcessor()` and CLI behavior is unchanged for documents without a marker.
- Keep the CLI's I/O injection and exit-code conventions.
